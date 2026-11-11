/**
 * WhatsApp Approval Workflow Orchestrator
 * Links AI content generation with WhatsApp Cloud API messaging and handles owner decisions in memory.
 */

import { EventEmitter } from 'events';
import { generateMultilingualPost } from '../generator/aiService.js';
import { whatsappClient } from './client.js';
import { config } from '../config.js';
import { ansi } from '../utils/ansi.js';

class WhatsAppWorkflowManager extends EventEmitter {
  constructor() {
    super();
    this.currentPendingPost = null;
    this.approvedPost = null;
    this.status = 'IDLE'; // IDLE | AWAITING_GENERATE | AWAITING_APPROVAL | APPROVED | DISCARDED
  }

  /**
   * Generates a new post and dispatches it to owner's WhatsApp
   * @param {string} [customTopic]
   */
  async generateAndSend(customTopic = '') {
    console.log(ansi.emeraldText('⚡ Generating fresh multilingual post for WhatsApp review...'));

    const post = await generateMultilingualPost(customTopic);
    this.currentPendingPost = post;
    this.status = 'AWAITING_APPROVAL';

    console.log(`Topic: ${post.topic}`);
    console.log(`Sending to owner WhatsApp: ${config.ownerPhoneNumber || '[NOT CONFIGURED]'}`);

    if (!config.ownerPhoneNumber) {
      console.log(ansi.yellowText('[Notice] OWNER_PHONE_NUMBER is not set in .env. Post generated and waiting in memory.'));
      return { success: true, post, sent: false, reason: 'OWNER_PHONE_NOT_SET' };
    }

    if (!whatsappClient.isConfigured()) {
      console.log(ansi.yellowText('[Notice] WhatsApp credentials not configured yet. Post generated and stored in memory.'));
      return { success: true, post, sent: false, reason: 'WHATSAPP_NOT_CONFIGURED' };
    }

    let sendResult = null;
    let sendError = null;
    try {
      sendResult = await whatsappClient.sendPostForReview(config.ownerPhoneNumber, post);
      console.log(ansi.emeraldText('✓ Post sent to your WhatsApp! Awaiting your reply (1, 2, 3, 4, or 5)...'));
    } catch (err) {
      sendError = err.message;
      console.error(ansi.yellowText(`[WhatsApp Send Notice] ${err.message}`));
    }

    return {
      success: true,
      post,
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

    // Optional security check: ignore messages from unknown numbers if owner number is configured
    if (cleanOwner && cleanSender && cleanSender !== cleanOwner) {
      console.warn(`[WhatsApp Security] Ignored message from unauthorized sender: ${fromNumber}`);
      return { ignored: true, reason: 'UNAUTHORIZED_SENDER' };
    }

    // ------------------------------------------------------------
    // SCENARIO 1: NO POST IS CURRENTLY PENDING
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
            await whatsappClient.sendText(fromNumber, '⚡ Generating a fresh multilingual post for you. Stand by...');
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
    // SCENARIO 2: A POST IS AWAITING APPROVAL
    // ------------------------------------------------------------
    const post = this.currentPendingPost;

    // 1. APPROVE ENGLISH
    if (input === '1' || input.includes('english') || input === 'approve_english') {
      this.approvedPost = {
        language: 'English',
        content: post.english,
        topic: post.topic,
        approvedAt: new Date().toISOString()
      };
      this.status = 'APPROVED';
      this.currentPendingPost = null;
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the ENGLISH version!'));

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

    // 2. APPROVE ROMAN URDU
    if (input === '2' || input.includes('roman') || input === 'approve_roman') {
      this.approvedPost = {
        language: 'Roman Urdu',
        content: post.romanUrdu,
        topic: post.topic,
        approvedAt: new Date().toISOString()
      };
      this.status = 'APPROVED';
      this.currentPendingPost = null;
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the ROMAN URDU version!'));

      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendApprovalConfirmation(fromNumber, 'Roman Urdu', post.romanUrdu);
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }

      const decision = {
        action: 'APPROVED',
        status: 'APPROVED',
        language: 'Roman Urdu',
        approvedPost: post.romanUrdu,
        topic: post.topic,
        approvedAt: this.approvedPost.approvedAt
      };
      this.emit('owner_decision', decision);
      return decision;
    }

    // 3. APPROVE PLAIN URDU
    if (input === '3' || input.includes('urdu') || input === 'approve_urdu') {
      this.approvedPost = {
        language: 'Plain Urdu',
        content: post.plainUrdu,
        topic: post.topic,
        approvedAt: new Date().toISOString()
      };
      this.status = 'APPROVED';
      this.currentPendingPost = null;
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the PLAIN URDU version!'));

      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendApprovalConfirmation(fromNumber, 'Plain Urdu', post.plainUrdu);
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }

      const decision = {
        action: 'APPROVED',
        status: 'APPROVED',
        language: 'Plain Urdu',
        approvedPost: post.plainUrdu,
        topic: post.topic,
        approvedAt: this.approvedPost.approvedAt
      };
      this.emit('owner_decision', decision);
      return decision;
    }

    // 4. RETRY / REGENERATE
    if (input === '4' || input.includes('retry') || input === 'retry_post') {
      console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested REGENERATION. Generating fresh post...'));
      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendText(fromNumber, '⚡ Generating a fresh post for review. Stand by...');
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }
      return await this.generateAndSend();
    }

    // 5. DISCARD
    if (input === '5' || input.includes('discard') || input.includes('cancel')) {
      this.status = 'DISCARDED';
      this.currentPendingPost = null;
      console.log(ansi.dimText('\n✕ [WhatsApp Action] Owner DISCARDED the post.'));

      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendText(
            fromNumber,
            '🗑️ Post discarded. Send any message or press 1 to start again.'
          );
        } catch (e) {
          console.warn('[WhatsApp Send Warning]', e.message);
        }
      }

      const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
      this.emit('owner_decision', decision);
      return decision;
    }

    // Unknown command while post is pending
    if (whatsappClient.isConfigured() && fromNumber) {
      try {
        await whatsappClient.sendText(
          fromNumber,
          `🤖 *X_BOT Command Options:*\n• *1* ➔ Approve English\n• *2* ➔ Approve Roman Urdu\n• *3* ➔ Approve Plain Urdu\n• *4* ➔ Retry / Generate New\n• *5* ➔ Discard`
        );
      } catch (e) {
        console.warn('[WhatsApp Send Warning]', e.message);
      }
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
