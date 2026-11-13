/**
 * Express Webhook Server for Meta WhatsApp Cloud API
 * Handles:
 * - GET /webhook (Meta verification handshake)
 * - POST /webhook (Receives owner's 1, 2, 3, 4, 5 replies or button taps)
 * - POST /generate (Trigger to create and send post to WhatsApp)
 * - GET /status (Check current in-memory approval state)
 */

import express from 'express';
import { config } from '../config.js';
import { whatsappWorkflow } from './workflow.js';
import { whatsappClient } from './client.js';
import { postScheduler } from '../utils/scheduler.js';
import { keepAliveService } from '../utils/keepAlive.js';
import { initMongo, isMongoConnected } from '../db/mongo.js';
import { PostModel } from '../db/postModel.js';
import { xService } from '../x/xService.js';
import { ansi } from '../utils/ansi.js';

const app = express();
app.use(express.json());

// ============================================================
// GLOBAL REQUEST LOGGER MIDDLEWARE
// Prominently logs every incoming request in Render & server stdout
// ============================================================
app.use((req, res, next) => {
  const start = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // For high-frequency /health checks, keep log line clean and compact
  if (req.path === '/health') {
    res.on('finish', () => {
      console.log(`[KeepAlive] GET /health -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    return next();
  }

  console.log(`\n======================================================`);
  console.log(`🌐 [HTTP INCOMING] ${req.method} ${req.originalUrl}`);
  console.log(`   Source IP:   ${clientIp}`);
  console.log(`   User-Agent:  ${userAgent}`);
  console.log(`   Timestamp:   ${new Date().toISOString()}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    const bodyStr = JSON.stringify(req.body);
    console.log(`   Payload:     ${bodyStr && bodyStr.length > 250 ? bodyStr.slice(0, 250) + '...' : bodyStr}`);
  }
  console.log(`======================================================`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const isOk = res.statusCode < 400;
    const badge = isOk ? ansi.emeraldText(`✓ [HTTP COMPLETED]`) : ansi.yellowText(`⚠ [HTTP COMPLETED]`);
    console.log(`${badge} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)\n`);
  });

  next();
});

// ============================================================
// 1. WEBHOOK VERIFICATION (GET /webhook)
// Meta sends a GET request when configuring the webhook in Developer Dashboard.
// ============================================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`\n[Webhook Handshake] Received verification check with token: ${token}`);

  const validTokens = [config.webhookVerifyToken, 'zamong-key', 'xbot_verify_token_2026'].filter(Boolean);
  const isValid = mode === 'subscribe' && validTokens.includes(token);

  if (isValid) {
    console.log(ansi.emeraldText('✓ Webhook successfully verified with Meta!'));
    res.status(200).send(challenge);
  } else {
    console.warn(ansi.yellowText(`✕ Webhook verification failed. Token "${token}" does not match expected verify tokens.`));
    res.sendStatus(403);
  }
});

// ============================================================
// 2. INBOUND MESSAGE RECEIVER (POST /webhook)
// Meta delivers messages and interactive button clicks here.
// ============================================================
app.post('/webhook', async (req, res) => {
  // Always acknowledge Meta with 200 OK immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log(`\n📩 [Inbound Webhook Received]:`, JSON.stringify(body));

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // Check if change contains messages (delivery statuses do not contain messages)
        const messages = value.messages || [];
        for (const message of messages) {
          const from = message.from; // Sender's phone number
          let incomingText = '';

          if (message.type === 'text') {
            incomingText = message.text?.body || '';
          } else if (message.type === 'interactive') {
            incomingText =
              message.interactive?.button_reply?.id ||
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.id ||
              message.interactive?.list_reply?.title ||
              '';
          } else if (message.type === 'button') {
            incomingText = message.button?.text || message.button?.payload || '';
          }

          if (incomingText) {
            console.log(`\n📩 [Inbound WhatsApp Message] From: ${from} | Text: "${incomingText}"`);
            const replyResult = await whatsappWorkflow.handleOwnerReply(incomingText, from);
            if (replyResult?.action === 'IGNORED_NON_OWNER') {
              console.log(ansi.dimText(`   🛡️ [Security] Non-owner contact. Zero bot interaction sent. Regular WhatsApp preserved.`));
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook Error]', err);
  }
});

// ============================================================
// 3. TRIGGER POST & WAIT FOR OWNER DECISION (POST /trigger)
// Generates post, sends it to WhatsApp, and WAITS for owner's response
// ============================================================
app.post('/trigger', async (req, res) => {
  try {
    const customTopic = req.body?.topic || '';
    const timeoutMs = Number(req.body?.timeoutMs || req.query?.timeout || 300000);

    console.log(`\n⚡ [/trigger] Request received for topic: "${customTopic || 'Auto'}"`);
    console.log(`   Waiting up to ${Math.round(timeoutMs / 1000)}s for owner WhatsApp response...`);

    const result = await whatsappWorkflow.generateSendAndWait(customTopic, timeoutMs);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 4. TRIGGER POST GENERATION ASYNC (POST /generate)
// Endpoint to trigger a new post and send it immediately without waiting
// ============================================================
app.post('/generate', async (req, res) => {
  const customTopic = req.body?.topic || '';
  const caller = req.headers['user-agent']?.includes('GitHub')
    ? 'GitHub Actions'
    : (req.headers['user-agent'] || 'Direct API');

  console.log(ansi.boldText(`\n🚀 [POST /generate] Post generation triggered!`));
  console.log(`   Trigger Source:  ${caller}`);
  console.log(`   Requested Topic: "${customTopic || 'Auto Trending Theme'}"`);

  try {
    const result = await whatsappWorkflow.generateAndSend(customTopic);

    console.log(`   AI Result:       ✓ Generated topic "${result.post?.topic}"`);
    if (result.sent) {
      console.log(ansi.emeraldText(`   WhatsApp Send:   ✓ SUCCESS (Delivered to ${config.ownerPhoneNumber})`));
    } else {
      console.log(ansi.yellowText(`   WhatsApp Send:   ✕ FAILED (${result.error || result.reason || 'Not delivered'})`));
    }

    res.status(200).json(result);
  } catch (err) {
    console.error(ansi.redText(`   Processing Err:  ✕ ${err.message}`));
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 5. OWNER DIRECT RESPONSE / SIMULATION (POST /respond)
// Trigger an owner response directly over HTTP (e.g. for testing)
// ============================================================
app.post('/respond', async (req, res) => {
  try {
    const reply = req.body?.reply || req.body?.action || req.body?.text || '1';
    const from = req.body?.from || config.ownerPhoneNumber;

    const result = await whatsappWorkflow.handleOwnerReply(reply, from);
    res.status(200).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 4. TRIGGER TEMPLATE MESSAGE (POST /send-template)
// Endpoint to send pre-approved template message to recipient
// ============================================================
app.post('/send-template', async (req, res) => {
  try {
    const to = req.body?.to || config.ownerPhoneNumber;
    const templateName = req.body?.template || config.whatsappTemplateName;
    const language = req.body?.language || config.whatsappTemplateLang;
    const components = req.body?.components || [];

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const result = await whatsappClient.sendTemplate(to, templateName, language, components);
    res.status(200).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 6. SCHEDULER ENDPOINTS (GET/POST /schedule)
// View or update daily automatic post generation schedule
// ============================================================
app.get('/schedule', (req, res) => {
  res.status(200).json(postScheduler.getStatus());
});

app.post('/schedule', (req, res) => {
  try {
    const updated = postScheduler.updateConfig(req.body);
    res.status(200).json({ success: true, schedule: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 7. DIAGNOSTICS & WHATSAPP META INSPECTOR (GET /api/debug-whatsapp)
// Returns raw Meta Graph API inspection data for debugging
// ============================================================
app.get('/api/debug-whatsapp', async (req, res) => {
  const targetNumber = String(req.query.to || config.ownerPhoneNumber || '').replace(/[^0-9]/g, '');
  const pId = config.whatsappPhoneNumberId;
  const token = config.whatsappToken;
  const version = config.graphApiVersion;

  const diagnostics = {
    configured: {
      phoneNumberId: pId,
      ownerNumber: targetNumber,
      apiVersion: version,
      hasToken: Boolean(token),
      tokenPrefix: token ? token.slice(0, 15) + '...' : 'none'
    },
    metaPhoneNumberInfo: null,
    testTextAttempt: null,
    testTemplateAttempt: null
  };

  try {
    const infoUrl = `https://graph.facebook.com/${version}/${pId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status,throughput`;
    const infoRes = await fetch(infoUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    diagnostics.metaPhoneNumberInfo = {
      httpStatus: infoRes.status,
      response: await infoRes.json()
    };
  } catch (err) {
    diagnostics.metaPhoneNumberInfo = { error: err.message };
  }

  try {
    const msgUrl = `https://graph.facebook.com/${version}/${pId}/messages`;
    const textPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetNumber,
      type: 'text',
      text: { body: 'X_BOT test ping' }
    };
    const textRes = await fetch(msgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(textPayload)
    });
    diagnostics.testTextAttempt = {
      httpStatus: textRes.status,
      payloadSent: textPayload,
      response: await textRes.json()
    };
  } catch (err) {
    diagnostics.testTextAttempt = { error: err.message };
  }

  try {
    const msgUrl = `https://graph.facebook.com/${version}/${pId}/messages`;
    const templatePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetNumber,
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' }
      }
    };
    const tmplRes = await fetch(msgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templatePayload)
    });
    diagnostics.testTemplateAttempt = {
      httpStatus: tmplRes.status,
      payloadSent: templatePayload,
      response: await tmplRes.json()
    };
  } catch (err) {
    diagnostics.testTemplateAttempt = { error: err.message };
  }

  res.status(200).json(diagnostics);
});

// ============================================================
// 8. X (TWITTER) OAUTH 2.0 PKCE ENDPOINTS
// Handles user authorization & callback for direct timeline publishing
// ============================================================

// Initiate X Authorization
app.get('/auth/x', (req, res) => {
  try {
    const { url } = xService.getAuthorizationUrl();
    console.log(ansi.emeraldText(`\n🔗 [X Auth] Redirecting user to X OAuth authorization...`));
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Error initiating X authorization: ${err.message}`);
  }
});

// X OAuth 2.0 Callback URL
app.get('/auth/x/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.warn(`[X Auth Error] ${error}: ${error_description}`);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>X Auth Failed</title></head>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center; background: #000; color: #fff;">
          <h1 style="color: #f4212e;">✕ Authorization Denied</h1>
          <p>${error_description || error}</p>
          <a href="/auth/x" style="color: #1d9bf0;">Click here to try again</a>
        </body>
      </html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send('Missing authorization code or state parameter.');
  }

  try {
    const tokenRecord = await xService.handleCallback(code, state);
    const username = tokenRecord.user?.username || 'Owner';

    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>X Connected Successfully</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #000; color: #e7e9ea; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #16181c; border: 1px solid #2f3336; border-radius: 16px; padding: 36px; max-width: 440px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
            .badge { display: inline-block; background: #00ba7c22; color: #00ba7c; border: 1px solid #00ba7c55; border-radius: 20px; padding: 6px 14px; font-weight: 600; font-size: 14px; margin-bottom: 16px; }
            h1 { font-size: 24px; margin: 0 0 12px 0; color: #fff; }
            p { color: #71767b; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0; }
            .handle { color: #1d9bf0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Connected</div>
            <h1>X Account Linked!</h1>
            <p>Successfully authenticated as <span class="handle">@${username}</span>.<br><br>X_BOT is now authorized to publish approved posts directly to your X timeline.</p>
            <p style="font-size: 13px; color: #536471;">You can close this tab and return to WhatsApp.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[X Callback Error]', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>X Auth Error</title></head>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center; background: #000; color: #fff;">
          <h1 style="color: #f4212e;">✕ Authentication Failed</h1>
          <p>${err.message}</p>
          <a href="/auth/x" style="color: #1d9bf0;">Click here to retry</a>
        </body>
      </html>
    `);
  }
});

// X Connection Status
app.get('/auth/x/status', async (req, res) => {
  try {
    const status = await xService.getStatus();
    res.status(200).json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct X Tweet Publishing (POST /publish)
app.post('/publish', async (req, res) => {
  try {
    const text = req.body?.text;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Request body must include a "text" field.' });
    }
    const result = await xService.publishTweet(text);
    const status = await xService.getStatus();
    const username = status?.user?.username || 'MussawerSafi';
    res.status(200).json({
      success: true,
      tweet: result,
      url: `https://x.com/${username}/status/${result.id}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 9. STATUS, POSTS & HEALTH ENDPOINTS
// ============================================================
app.get('/status', async (req, res) => {
  const xStatus = await xService.getStatus().catch(() => null);
  res.json({
    app: config.appName,
    version: config.appVersion,
    whatsappConfigured: whatsappClient.isConfigured(),
    ownerNumberConfigured: Boolean(config.ownerPhoneNumber),
    xConnected: xStatus?.connected || false,
    xUser: xStatus?.user?.username ? `@${xStatus.user.username}` : null,
    database: {
      connected: isMongoConnected(),
      cluster: 'MongoDB Atlas (cluster0.jsxyhxh.mongodb.net)',
      database: 'x_bot'
    },
    contentConfig: {
      englishLevel: config.englishLevel,
      themes: config.contentThemes
    },
    schedule: postScheduler.getStatus(),
    state: whatsappWorkflow.getCurrentState()
  });
});

app.get('/posts', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const posts = await PostModel.find({}).sort({ createdAt: -1 }).limit(30).lean();
      return res.status(200).json({ success: true, count: posts.length, posts });
    }
    res.status(200).json({ success: true, databaseConnected: false, message: 'Database pending connection or running in-memory.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================
// START SERVER
// ============================================================
export function startServer(port = config.serverPort) {
  // Initialize MongoDB Atlas connection in background
  initMongo().catch(err => {
    console.warn('[MongoDB Background Error]', err.message);
  });

  // Start the background post scheduler
  postScheduler.start();

  // Start the self-ping keep-alive service to prevent free Render from sleeping
  keepAliveService.start();

  return app.listen(port, () => {
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`       ${ansi.emeraldText('X_BOT — WHATSAPP WEBHOOK SERVER RUNNING')}`));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(`  Local URL:        ${ansi.boldText(`http://localhost:${port}`)}`);
    console.log(`  Webhook Endpoint: ${ansi.emeraldText(`http://localhost:${port}/webhook`)}`);
    console.log(`  Verify Token:     ${ansi.cyanText(config.webhookVerifyToken)}`);
    console.log(`  WhatsApp Ready:   ${whatsappClient.isConfigured() ? ansi.emeraldText('YES') : ansi.yellowText('PENDING .env CREDENTIALS')}`);
    console.log(`  Owner Number:     ${config.ownerPhoneNumber ? ansi.emeraldText(config.ownerPhoneNumber) : ansi.yellowText('NOT SET YET')}`);
    console.log(ansi.separator('=', 64, ansi.emerald) + '\n');
    console.log(ansi.dimText('Ready to receive verification handshake and owner approval replies.\n'));
  });
}

// Auto-start if executed directly (e.g. `npm run webhook`)
if (process.argv[1]?.endsWith('server.js')) {
  startServer();
}

export default app;
