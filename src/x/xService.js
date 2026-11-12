/**
 * X (Twitter) API v2 Integration & OAuth 2.0 PKCE Service
 * Handles:
 * - OAuth 2.0 Authorization URL generation (PKCE S256)
 * - Callback handling (/auth/x/callback) & token exchange
 * - Automatic token refresh via refresh_token (offline.access)
 * - Publishing tweets (POST https://api.twitter.com/2/tweets)
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { isMongoConnected } from '../db/mongo.js';
import { ansi } from '../utils/ansi.js';

// In-memory PKCE state cache (expires after 15 minutes)
const pendingStates = new Map(); // state -> { verifier, createdAt }

// MongoDB Schema for persisting X OAuth tokens
const XTokenSchema = new mongoose.Schema({
  key: { type: String, default: 'primary', unique: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, default: null },
  scope: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
  user: {
    id: { type: String, default: null },
    name: { type: String, default: null },
    username: { type: String, default: null }
  },
  updatedAt: { type: Date, default: Date.now }
});

const XTokenModel = mongoose.models.XToken || mongoose.model('XToken', XTokenSchema);

// In-memory fallback token store
let inMemoryToken = null;

export class XService {
  constructor() {
    this.clientId = config.xClientId;
    this.clientSecret = config.xClientSecret;
    this.callbackUrl = config.xCallbackUrl;
  }

  /**
   * Generates PKCE code verifier and SHA-256 code challenge
   */
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  /**
   * Generates authorization URL for owner to authorize bot to post to X
   */
  getAuthorizationUrl() {
    const { verifier, challenge } = this.generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // Save pending state for verification (clean up older than 15 mins)
    const now = Date.now();
    for (const [s, data] of pendingStates.entries()) {
      if (now - data.createdAt > 15 * 60 * 1000) {
        pendingStates.delete(s);
      }
    }
    pendingStates.set(state, { verifier, createdAt: now });

    const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: scopes,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    return {
      url: `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
      state
    };
  }

  /**
   * Handles OAuth 2.0 callback and exchanges code for access token
   * @param {string} code
   * @param {string} state
   */
  async handleCallback(code, state) {
    const pending = pendingStates.get(state);
    if (!pending) {
      throw new Error('Invalid or expired OAuth state parameter. Please try logging in again.');
    }
    pendingStates.delete(state);

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      code_verifier: pending.verifier
    });

    console.log(ansi.emeraldText('\n[X OAuth] Exchanging authorization code for OAuth 2.0 tokens...'));

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const errDetail = tokenData.error_description || tokenData.error || tokenRes.statusText;
      console.error('[X OAuth Token Error]', tokenData);
      throw new Error(`X OAuth token exchange failed (${tokenRes.status}): ${errDetail}`);
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;
    const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000); // 1-minute buffer

    // Fetch user profile info
    let userInfo = null;
    try {
      const meRes = await fetch('https://api.twitter.com/2/users/me', {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        userInfo = meData.data; // { id, name, username }
      }
    } catch (err) {
      console.warn('[X User Profile Notice]', err.message);
    }

    // Persist token in MongoDB Atlas or in-memory
    const tokenRecord = {
      accessToken: access_token,
      refreshToken: refresh_token || null,
      scope: scope || '',
      expiresAt: expiresAt,
      user: userInfo || { username: 'Authorized User' },
      updatedAt: new Date()
    };

    inMemoryToken = tokenRecord;

    if (isMongoConnected()) {
      try {
        await XTokenModel.findOneAndUpdate(
          { key: 'primary' },
          { $set: tokenRecord },
          { upsert: true, new: true }
        );
        console.log(ansi.emeraldText(`✓ [X OAuth] Tokens saved securely in MongoDB Atlas for @${userInfo?.username || 'user'}`));
      } catch (err) {
        console.warn('[X Token DB Save Notice]', err.message);
      }
    }

    return tokenRecord;
  }

  /**
   * Retrieves active access token, auto-refreshing if expired
   */
  async getValidAccessToken() {
    let token = null;

    if (isMongoConnected()) {
      try {
        token = await XTokenModel.findOne({ key: 'primary' }).lean();
      } catch (err) {
        console.warn('[X Token Read DB Notice]', err.message);
      }
    }

    if (!token) {
      token = inMemoryToken;
    }

    if (!token || !token.accessToken) {
      return null;
    }

    // Check if token has expired
    if (new Date() >= new Date(token.expiresAt)) {
      if (!token.refreshToken) {
        console.warn('[X OAuth] Access token expired and no refresh token available.');
        return null;
      }
      return this.refreshAccessToken(token.refreshToken);
    }

    return token.accessToken;
  }

  /**
   * Refreshes an expired access token using refresh_token
   */
  async refreshAccessToken(refreshToken) {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    });

    console.log(ansi.cyanText('[X OAuth] Refreshing expired access token...'));

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[X OAuth Refresh Error]', data);
      throw new Error(`Failed to refresh X token: ${data.error_description || data.error}`);
    }

    const { access_token, refresh_token, expires_in, scope } = data;
    const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

    const updated = {
      accessToken: access_token,
      refreshToken: refresh_token || refreshToken,
      scope: scope || '',
      expiresAt: expiresAt,
      updatedAt: new Date()
    };

    inMemoryToken = { ...inMemoryToken, ...updated };

    if (isMongoConnected()) {
      try {
        await XTokenModel.findOneAndUpdate(
          { key: 'primary' },
          { $set: updated },
          { upsert: true }
        );
      } catch (err) {
        console.warn('[X Token Refresh DB Notice]', err.message);
      }
    }

    return access_token;
  }

  /**
   * Publishes a tweet to X using OAuth 2.0 user access token
   * Supports both single long post (X Premium / Basic) and automated thread splitting (Standard accounts)
   * @param {string} text - Tweet content
   */
  async publishTweet(text) {
    const accessToken = await this.getValidAccessToken();
    if (!accessToken) {
      throw new Error(
        'X account is not connected yet. Please visit /auth/x to authorize your X account.'
      );
    }

    // Try posting the complete story directly first (supported natively on X Premium / Basic up to 25k chars)
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const data = await res.json();

    // Check if error is due to character length on a non-premium standard account (280 char limit)
    const errMsgLower = (data.detail || data.title || JSON.stringify(data)).toLowerCase();
    const isLengthError =
      errMsgLower.includes('too long') ||
      errMsgLower.includes('character_limit') ||
      errMsgLower.includes('length') ||
      errMsgLower.includes('longer than');

    if (!res.ok && isLengthError) {
      console.log('[X Service] Single post exceeds standard 280 limit; posting as connected thread...');
      return await this.publishThread(text, accessToken);
    }

    if (!res.ok) {
      const errMsg = data.detail || data.title || JSON.stringify(data);
      console.error('[X Tweet Publish Error]', data);

      const isRechargeNeeded =
        res.status === 429 ||
        errMsg.toLowerCase().includes('usage') ||
        errMsg.toLowerCase().includes('cap') ||
        errMsg.toLowerCase().includes('credit') ||
        errMsg.toLowerCase().includes('limit') ||
        errMsg.toLowerCase().includes('payment') ||
        errMsg.toLowerCase().includes('tier') ||
        errMsg.toLowerCase().includes('subscribe');

      const err = new Error(
        isRechargeNeeded
          ? `Please recharge your X account for posting (${errMsg})`
          : `X Tweet Publish Failed (${res.status}): ${errMsg}`
      );
      err.status = res.status;
      err.isRechargeNeeded = isRechargeNeeded;
      err.raw = data;
      throw err;
    }

    return data.data; // { id, text }
  }

  /**
   * Splits a long story into connected sequential thread tweets (280 chars each)
   * @param {string} fullText
   * @param {string} accessToken
   */
  async publishThread(fullText, accessToken) {
    const paragraphs = fullText.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks = [];
    let current = '';

    for (const p of paragraphs) {
      if (!current) {
        if (p.length <= 260) {
          current = p;
        } else {
          const sentences = p.match(/[^.!?\n]+[.!?\n]+/g) || [p];
          for (const s of sentences) {
            if ((current + ' ' + s).trim().length <= 260) {
              current = (current + ' ' + s).trim();
            } else {
              if (current) chunks.push(current);
              current = s.trim();
            }
          }
        }
      } else if ((current + '\n\n' + p).length <= 260) {
        current = current + '\n\n' + p;
      } else {
        chunks.push(current);
        current = p;
      }
    }
    if (current) chunks.push(current);

    let lastTweetId = null;
    let firstTweetData = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ${chunks[i]}` : chunks[i];
      const payload = { text: chunkText };
      if (lastTweetId) {
        payload.reply = { in_reply_to_tweet_id: lastTweetId };
      }

      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Failed to post thread part ${i + 1}: ${data.detail || JSON.stringify(data)}`);
      }

      lastTweetId = data.data.id;
      if (!firstTweetData) firstTweetData = data.data;
    }

    return firstTweetData;
  }

  /**
   * Returns current X integration connection status
   */
  async getStatus() {
    let token = null;
    if (isMongoConnected()) {
      try {
        token = await XTokenModel.findOne({ key: 'primary' }).lean();
      } catch (err) {}
    }
    if (!token) token = inMemoryToken;

    const isConnected = Boolean(token && token.accessToken);
    const isExpired = isConnected ? new Date() >= new Date(token.expiresAt) : false;

    return {
      configured: Boolean(this.clientId && this.clientSecret),
      clientId: this.clientId ? this.clientId.slice(0, 8) + '...' : null,
      callbackUrl: this.callbackUrl,
      connected: isConnected,
      expired: isExpired,
      user: token?.user || null,
      expiresAt: token?.expiresAt || null
    };
  }
}

export const xService = new XService();
