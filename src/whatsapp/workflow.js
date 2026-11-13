/**
 * WhatsApp Approval Workflow Orchestrator
 * Links AI content generation with WhatsApp Cloud API messaging and handles owner decisions in memory.
 */

import { EventEmitter } from 'events';
import {
  generateEnglishPost,
  generateRomanUrduFromEnglish,
  generatePlainUrduFromEnglish
} from '../generator/aiService.js';
import { whatsappClient } from './client.js';
import { config } from '../config.js';
import { ansi } from '../utils/ansi.js';
import { keepAliveService } from '../utils/keepAlive.js';
import { markPostApproved, markPostDiscarded, markPostPublished } from '../db/postModel.js';
import { xService } from '../x/xService.js';

class WhatsAppWorkflowManager extends EventEmitter {
  constructor() {
    super();
    this.currentPendingPost = null; // { topic, english, romanUrdu, plainUrdu, activeView }
    this.approvedPost = null;
    this.status = 'IDLE'; // IDLE | AWAITING_GENERATE | AWAITING_APPROVAL | APPROVED | DISCARDED
  }

  /**
   * Generates 1 good English post and dispatches it to owner's WhatsApp with 5 options
   * @param {string} [customTopic]
   */
  async generateAndSend(customTopic = '') {
    console.log(ansi.emeraldText('⚡ Generating 1 high-quality English post for WhatsApp review...'));

    const gen = await generateEnglishPost(customTopic);
    this.currentPendingPost = {
      topic: gen.topic,
      english: gen.english,
      romanUrdu: null,
      plainUrdu: null,
      activeView: 'ENGLISH', // ENGLISH | ROMAN_URDU | PLAIN_URDU
      generatedAt: new Date().toISOString()
    };
    this.status = 'AWAITING_APPROVAL';
    keepAliveService.setWaitingForResponse(true);

    console.log(`Topic: ${gen.topic}`);
    console.log(`Sending to owner WhatsApp: ${config.ownerPhoneNumber || '[NOT CONFIGURED]'}`);

    if (!config.ownerPhoneNumber) {
      console.log(ansi.yellowText('[Notice] OWNER_PHONE_NUMBER is not set in .env. Post generated and waiting in memory.'));
      return { success: true, post: this.currentPendingPost, sent: false, reason: 'OWNER_PHONE_NOT_SET' };
    }

    if (!whatsappClient.isConfigured()) {
      console.log(ansi.yellowText('[Notice] WhatsApp credentials not configured yet. Post generated and stored in memory.'));
      return { success: true, post: this.currentPendingPost, sent: false, reason: 'WHATSAPP_NOT_CONFIGURED' };
    }

    let sendResult = null;
    let sendError = null;
    try {
      sendResult = await whatsappClient.sendEnglishPostForReview(config.ownerPhoneNumber, this.currentPendingPost);
      console.log(ansi.emeraldText('✓ English post sent to WhatsApp with 5 action options!'));
    } catch (err) {
      sendError = err.message;
      console.error(ansi.yellowText(`[WhatsApp Send Notice] ${err.message}`));
    }

    return {
      success: true,
      post: this.currentPendingPost,
      sent: !sendError,
      messageId: sendResult?.messages?.[0]?.id,
      error: sendError
    };
  }

  /**
   * Generates post, sends it, and waits for owner's response
   * @param {string} [customTopic]
   * @param {number} [timeoutMs=300000]
   */
  async generateSendAndWait(customTopic = '', timeoutMs = 300000) {
    return new Promise(async (resolve) => {
      let timer = null;
      let genResult = null;

      const onDecision = (decision) => {
        if (timer) clearTimeout(timer);
        this.removeListener('owner_decision', onDecision);
        resolve({
          ...decision,
          topic: decision.topic || genResult?.post?.topic,
          post: genResult?.post,
          sent: genResult?.sent,
          sendError: genResult?.error
        });
      };

      // Attach listener first so we don't miss early replies
      this.on('owner_decision', onDecision);

      genResult = await this.generateAndSend(customTopic);

      // If owner decision already arrived during generation
      if (this.status === 'APPROVED' || this.status === 'DISCARDED') {
        if (timer) clearTimeout(timer);
        this.removeListener('owner_decision', onDecision);
        return resolve({
          action: this.status,
          status: this.status,
          topic: genResult?.post?.topic,
          post: genResult?.post,
          sent: genResult?.sent,
          sendError: genResult?.error
        });
      }

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.removeListener('owner_decision', onDecision);
          resolve({
            action: 'TIMEOUT',
            status: 'TIMEOUT',
            message: `Owner did not reply within ${Math.round(timeoutMs / 1000)}s.`,
            post: genResult?.post,
            sent: genResult?.sent,
            sendError: genResult?.error
          });
        }, timeoutMs);
      }
    });
  }

  /**
   * Publishes approved post directly to live X (Twitter) account
   * @param {string} language - English | Roman Urdu | Plain Urdu
   * @param {object} versionObj - Approved language object
   * @param {string} topic
   */
  async publishToX(language, versionObj, topic) {
    const tweetText = (versionObj.fullPost || `${versionObj.text}\n\n${versionObj.hashtags || ''}`).trim();
    let tweetDetails = null;

    try {
      console.log(ansi.boldText(`\n🚀 [Publishing to X] Posting ${language} version to live X account...`));
      console.log(`   Text preview: "${tweetText.slice(0, 100)}..."`);

      const tweetResult = await xService.publishTweet(tweetText);
      const xStatus = await xService.getStatus();
      const username = xStatus?.user?.username || 'MussawerSafi';
      const tweetUrl = `https://x.com/${username}/status/${tweetResult.id}`;

      console.log(ansi.emeraldText(`✓ [X Published] Successfully posted to X! Tweet ID: ${tweetResult.id}`));
      console.log(ansi.cyanText(`   Live Tweet URL: ${tweetUrl}`));

      // Permanently mark as published in database so it is never reused or regenerated
      await markPostPublished(topic, language, tweetResult.id, tweetUrl).catch(() => {});

      tweetDetails = {
        id: tweetResult.id,
        username,
        url: tweetUrl,
        publishedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error(ansi.redText(`✕ [X Publish Error] ${err.message}`));
      const isRecharge =
        Boolean(err.isRechargeNeeded) ||
        err.message?.toLowerCase().includes('recharge') ||
        err.message?.toLowerCase().includes('usage') ||
        err.message?.toLowerCase().includes('cap') ||
        err.message?.toLowerCase().includes('credit') ||
        err.message?.toLowerCase().includes('limit') ||
        err.status === 429;

      tweetDetails = {
        error: err.message,
        isRechargeNeeded: isRecharge
      };
    }

    return tweetDetails;
  }

  /**
   * Returns normalized list of authorized owner phone numbers
   */
  getAllowedOwnerNumbers() {
    const rawList = [
      config.ownerPhoneNumber,
      process.env.OWNER_PHONE_NUMBER,
      process.env.OWNER_PHONE_NUMBERS
    ].filter(Boolean).join(',');

    const set = new Set();
    rawList.split(/[,\s;]+/).forEach(num => {
      const clean = String(num).replace(/[^0-9]/g, '');
      // Never allow the bot's own number to act as owner
      if (clean && clean !== '923290958704') {
        set.add(clean);
      }
    });

    // Known verified owner numbers
    set.add('923435022880');
    set.add('923469258704');

    return Array.from(set);
  }

  /**
   * Strictly validates if the incoming phone number belongs to the owner.
   * If sender is NOT owner, the bot ignores it completely so normal WhatsApp
   * functionality is preserved for other contacts.
   * @param {string} fromNumber 
   * @returns {boolean}
   */
  isOwner(fromNumber) {
    if (!fromNumber) {
      // Internal call without sender context
      return true;
    }

    const cleanSender = String(fromNumber).replace(/[^0-9]/g, '');
    if (!cleanSender) return false;

    // Never allow the bot's own number to act as owner
    if (cleanSender === '923290958704') {
      return false;
    }

    const allowedOwners = this.getAllowedOwnerNumbers();
    return allowedOwners.some(owner => {
      const cleanOwner = String(owner).replace(/[^0-9]/g, '');
      if (!cleanOwner) return false;
      if (cleanSender === cleanOwner) return true;
      if (
        cleanSender.length >= 10 &&
        cleanOwner.length >= 10 &&
        cleanSender.slice(-10) === cleanOwner.slice(-10)
      ) {
        return true;
      }
      return false;
    });
  }

  /**
   * Processes incoming reply from the owner's WhatsApp
   * @param {string} rawInput - Text message or interactive button ID
   * @param {string} fromNumber - Sender phone number
   */
  async handleOwnerReply(rawInput = '', fromNumber = '') {
    // ------------------------------------------------------------
    // STRICT OWNER SECURITY GUARD:
    // Only the owner can interact with X_BOT features.
    // For all other numbers, the bot remains completely silent and
    // functions like normal personal WhatsApp.
    // ------------------------------------------------------------
    if (!this.isOwner(fromNumber)) {
      console.log(
        ansi.dimText(`[WhatsApp Shield] Ignored message from non-owner (${fromNumber}). Bot is only active for owner. Normal WhatsApp preserved.`)
      );
      return {
        action: 'IGNORED_NON_OWNER',
        status: this.status,
        sender: fromNumber,
        message: 'Non-owner message ignored. Preserving normal WhatsApp.'
      };
    }

    const input = String(rawInput).trim().toLowerCase();

    // ------------------------------------------------------------
    // GLOBAL COMMAND: EXIT / SLEEP
    // ------------------------------------------------------------
    if (input === 'exit' || input === 'quit' || input === 'sleep' || input === 'stop') {
      this.status = 'IDLE';
      this.currentPendingPost = null;
      keepAliveService.setWaitingForResponse(false);
      console.log(ansi.dimText('\n😴 [WhatsApp Action] Bot entered SLEEP mode by owner command.'));
      const sleepMsg = '😴 X Assistant is now sleeping. Send any message whenever you want to wake me up again!';
      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendText(fromNumber, sleepMsg);
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }
      return { action: 'SLEEPING', status: 'IDLE', message: sleepMsg };
    }

    // ------------------------------------------------------------
    // SCENARIO 1: NO PENDING POST
    // ------------------------------------------------------------
    if (!this.currentPendingPost) {
      // If user sends "1", "new", "generate", "start", or "topic:..."
      if (input === '1' || input === 'new' || input === 'generate' || input === 'start' || input.startsWith('topic:')) {
        let customTopic = '';
        if (input.startsWith('topic:')) {
          customTopic = rawInput.slice(6).trim();
        }
        console.log(ansi.emeraldText('\n⟳ [WhatsApp Action] Owner pressed 1 to generate a new post...'));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Generating 1 good English post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend(customTopic);
      }

      // Any other SMS wakes the bot and sends the welcome greeting!
      this.status = 'AWAITING_GENERATE';
      console.log(ansi.emeraldText('\n👋 [WhatsApp Action] Bot woken up by owner! Sending welcome greeting...'));
      const welcomeMsg = 'HI, welcome to your X Assistant press 1 to generate new post';

      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendText(fromNumber, welcomeMsg);
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }

      return {
        action: 'GREETING_SENT',
        status: 'AWAITING_GENERATE',
        message: welcomeMsg
      };
    }

    // ------------------------------------------------------------
    // SCENARIO 2: PENDING POST EXISTS (Menu with 5 options)
    // ------------------------------------------------------------
    const post = this.currentPendingPost;

    // --- VIEW: ENGLISH POST ACTIVE ---
    if (!post.activeView || post.activeView === 'ENGLISH') {
      // Option 1: Generate in Roman Urdu
      if (input === '1' || input.includes('roman')) {
        console.log(ansi.emeraldText('\n⟳ [WhatsApp Action] Generating Roman Urdu from English post...'));
        if (!post.romanUrdu) {
          post.romanUrdu = await generateRomanUrduFromEnglish(post.english, post.topic);
        }
        post.activeView = 'ROMAN_URDU';

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendRomanUrduVersion(fromNumber, post);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return { action: 'VIEW_ROMAN_URDU', post };
      }

      // Option 2: Generate in Urdu (Plain Urdu)
      if (input === '2' || input.includes('urdu')) {
        console.log(ansi.emeraldText('\n⟳ [WhatsApp Action] Generating Plain Urdu from English post...'));
        if (!post.plainUrdu) {
          post.plainUrdu = await generatePlainUrduFromEnglish(post.english, post.topic);
        }
        post.activeView = 'PLAIN_URDU';

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendPlainUrduVersion(fromNumber, post);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return { action: 'VIEW_PLAIN_URDU', post };
      }

      // Option 3: Post directly in English
      if (input === '3' || input.includes('post') || input.includes('direct')) {
        this.approvedPost = {
          language: 'English',
          content: post.english,
          topic: post.topic,
          approvedAt: new Date().toISOString()
        };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'English').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ENGLISH directly!'));

        // Publish to real X account in production
        const tweetDetails = await this.publishToX('English', post.english, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english, tweetDetails);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }

        const decision = {
          action: 'APPROVED',
          status: 'APPROVED',
          language: 'English',
          approvedPost: post.english,
          topic: post.topic,
          tweet: tweetDetails,
          approvedAt: this.approvedPost.approvedAt
        };
        this.emit('owner_decision', decision);
        return decision;
      }

      // Option 4: Discard post
      if (input === '4' || input.includes('discard') || input.includes('cancel')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostDiscarded(post.topic).catch(() => {});
        console.log(ansi.dimText('\n✕ [WhatsApp Action] Owner DISCARDED the post.'));

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(
              fromNumber,
              '🗑️ Post discarded. Send any message or press 1 to generate a new post.'
            );
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }

        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // Option 5: Generate a brand NEW fresh post (Discard current and generate new)
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post...'));
        markPostDiscarded(post.topic).catch(() => {});
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Generating a completely fresh new post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend();
      }
    }

    // --- VIEW: ROMAN URDU ACTIVE ---
    if (post.activeView === 'ROMAN_URDU') {
      // 1: Approve & Post Roman Urdu
      if (input === '1' || input.includes('approve') || input.includes('post')) {
        this.approvedPost = {
          language: 'Roman Urdu',
          content: post.romanUrdu,
          topic: post.topic,
          approvedAt: new Date().toISOString()
        };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'Roman Urdu').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ROMAN URDU!'));

        // Publish to real X account in production
        const tweetDetails = await this.publishToX('Roman Urdu', post.romanUrdu, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'Roman Urdu', post.romanUrdu, tweetDetails);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'Roman Urdu', approvedPost: post.romanUrdu, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 2: Generate / Switch to Urdu (Plain Urdu)
      if (input === '2' || input.includes('urdu')) {
        if (!post.plainUrdu) {
          post.plainUrdu = await generatePlainUrduFromEnglish(post.english, post.topic);
        }
        post.activeView = 'PLAIN_URDU';
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendPlainUrduVersion(fromNumber, post);
          } catch (e) {}
        }
        return { action: 'VIEW_PLAIN_URDU', post };
      }

      // 3: Post English directly
      if (input === '3' || input.includes('english')) {
        this.approvedPost = {
          language: 'English',
          content: post.english,
          topic: post.topic,
          approvedAt: new Date().toISOString()
        };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'English').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ENGLISH directly!'));

        // Publish to real X account in production
        const tweetDetails = await this.publishToX('English', post.english, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english, tweetDetails);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostDiscarded(post.topic).catch(() => {});
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '🗑️ Post discarded. Send any message or press 1 to generate a new post.');
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Generate a brand NEW fresh post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post from Roman Urdu view...'));
        markPostDiscarded(post.topic).catch(() => {});
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Generating a completely fresh new post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend();
      }
    }

    // --- VIEW: PLAIN URDU ACTIVE ---
    if (post.activeView === 'PLAIN_URDU') {
      // 1: Approve & Post Plain Urdu
      if (input === '1' || input.includes('approve') || input.includes('post')) {
        this.approvedPost = {
          language: 'Plain Urdu',
          content: post.plainUrdu,
          topic: post.topic,
          approvedAt: new Date().toISOString()
        };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'Plain Urdu').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED PLAIN URDU!'));

        // Publish to real X account in production
        const tweetDetails = await this.publishToX('Plain Urdu', post.plainUrdu, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'Plain Urdu', post.plainUrdu, tweetDetails);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'Plain Urdu', approvedPost: post.plainUrdu, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 2: Generate / Switch to Roman Urdu
      if (input === '2' || input.includes('roman')) {
        if (!post.romanUrdu) {
          post.romanUrdu = await generateRomanUrduFromEnglish(post.english, post.topic);
        }
        post.activeView = 'ROMAN_URDU';
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendRomanUrduVersion(fromNumber, post);
          } catch (e) {}
        }
        return { action: 'VIEW_ROMAN_URDU', post };
      }

      // 3: Post English directly
      if (input === '3' || input.includes('english')) {
        this.approvedPost = {
          language: 'English',
          content: post.english,
          topic: post.topic,
          approvedAt: new Date().toISOString()
        };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'English').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ENGLISH directly!'));

        // Publish to real X account in production
        const tweetDetails = await this.publishToX('English', post.english, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english, tweetDetails);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostDiscarded(post.topic).catch(() => {});
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '🗑️ Post discarded. Send any message or press 1 to generate a new post.');
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Generate a brand NEW fresh post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post from Plain Urdu view...'));
        markPostDiscarded(post.topic).catch(() => {});
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Generating a completely fresh new post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend();
      }
    }

    // Default help response
    if (whatsappClient.isConfigured() && fromNumber) {
      try {
        await whatsappClient.sendText(
          fromNumber,
          `🤖 *Options:*\n• *1* ➔ Generate in Roman Urdu\n• *2* ➔ Generate in Urdu\n• *3* ➔ Post directly in English\n• *4* ➔ Discard post\n• *5* ➔ Generate a NEW fresh post`
        );
      } catch (e) {}
    }
    return { action: 'HELP_SENT' };
  }

  getCurrentState() {
    return {
      status: this.status,
      currentPendingPost: this.currentPendingPost,
      approvedPost: this.approvedPost
    };
  }
}

export const whatsappWorkflow = new WhatsAppWorkflowManager();
export const generateAndSendToWhatsApp = (topic) => whatsappWorkflow.generateAndSend(topic);
