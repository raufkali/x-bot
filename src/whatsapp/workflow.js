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
    const genResult = await this.generateAndSend(customTopic);

    return new Promise((resolve) => {
      let timer = null;

      const onDecision = (decision) => {
        if (timer) clearTimeout(timer);
        this.removeListener('owner_decision', onDecision);
        resolve({
          ...decision,
          topic: decision.topic || genResult.post?.topic,
          post: genResult.post,
          sent: genResult.sent,
          sendError: genResult.error
        });
      };

      this.on('owner_decision', onDecision);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.removeListener('owner_decision', onDecision);
          resolve({
            action: 'TIMEOUT',
            status: 'TIMEOUT',
            message: `Owner did not reply within ${Math.round(timeoutMs / 1000)}s.`,
            post: genResult.post,
            sent: genResult.sent,
            sendError: genResult.error
          });
        }, timeoutMs);
      }
    });
  }

  /**
   * Processes incoming reply from the owner's WhatsApp
   * @param {string} rawInput - Text message or interactive button ID
   * @param {string} fromNumber - Sender phone number
   */
  async handleOwnerReply(rawInput = '', fromNumber = '') {
    const input = String(rawInput).trim().toLowerCase();
    const cleanSender = String(fromNumber).replace(/[^0-9]/g, '');
    const cleanOwner = String(config.ownerPhoneNumber).replace(/[^0-9]/g, '');

    // Robust phone matching: matches exact digits or last 10 digits (handles 923... vs 03... vs +92...)
    const isOwnerMatch =
      !cleanOwner ||
      cleanSender === cleanOwner ||
      (cleanSender.length >= 10 && cleanOwner.length >= 10 && cleanSender.slice(-10) === cleanOwner.slice(-10));

    if (!isOwnerMatch) {
      console.warn(
        `[WhatsApp Notice] Sender ${fromNumber} does not match configured owner ${config.ownerPhoneNumber}. Processing for active session.`
      );
    }

    // ------------------------------------------------------------
    // GLOBAL COMMAND: EXIT / SLEEP
    // ------------------------------------------------------------
    if (input === 'exit' || input === 'quit' || input === 'sleep' || input === 'stop') {
      this.status = 'IDLE';
      this.currentPendingPost = null;
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
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ENGLISH directly!'));

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english);
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
          approvedAt: this.approvedPost.approvedAt
        };
        this.emit('owner_decision', decision);
        return decision;
      }

      // Option 4: Discard post
      if (input === '4' || input.includes('discard') || input.includes('cancel')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
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

      // Option 5: Regenerate the post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested REGENERATION of English post...'));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Regenerating fresh English post. Stand by...');
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
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED ROMAN URDU!'));

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'Roman Urdu', post.romanUrdu);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'Roman Urdu', approvedPost: post.romanUrdu, topic: post.topic };
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
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '🗑️ Post discarded. Send any message or press 1 to generate a new post.');
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Regenerate Roman Urdu
      if (input === '5' || input.includes('retry')) {
        post.romanUrdu = await generateRomanUrduFromEnglish(post.english, post.topic);
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendRomanUrduVersion(fromNumber, post);
          } catch (e) {}
        }
        return { action: 'VIEW_ROMAN_URDU', post };
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
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED & POSTED PLAIN URDU!'));

        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'Plain Urdu', post.plainUrdu);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'Plain Urdu', approvedPost: post.plainUrdu, topic: post.topic };
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
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english);
          } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '🗑️ Post discarded. Send any message or press 1 to generate a new post.');
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Regenerate Urdu
      if (input === '5' || input.includes('retry')) {
        post.plainUrdu = await generatePlainUrduFromEnglish(post.english, post.topic);
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendPlainUrduVersion(fromNumber, post);
          } catch (e) {}
        }
        return { action: 'VIEW_PLAIN_URDU', post };
      }
    }

    // Default help response
    if (whatsappClient.isConfigured() && fromNumber) {
      try {
        await whatsappClient.sendText(
          fromNumber,
          `🤖 *Options:*\n• *1* ➔ Generate in Roman Urdu\n• *2* ➔ Generate in Urdu\n• *3* ➔ Post directly in English\n• *4* ➔ Discard post\n• *5* ➔ Regenerate the post`
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
