/**
 * WhatsApp Approval Workflow Orchestrator
 * Links AI content generation with WhatsApp Cloud API messaging and handles owner decisions in memory.
 */

import { generateMultilingualPost } from '../generator/aiService.js';
import { whatsappClient } from './client.js';
import { config } from '../config.js';
import { ansi } from '../utils/ansi.js';

class WhatsAppWorkflowManager {
  constructor() {
    this.currentPendingPost = null;
    this.approvedPost = null;
    this.status = 'IDLE'; // IDLE | AWAITING_APPROVAL | APPROVED | DISCARDED
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

    const sendResult = await whatsappClient.sendPostForReview(config.ownerPhoneNumber, post);
    console.log(ansi.emeraldText('✓ Post sent to your WhatsApp! Awaiting your reply (1, 2, 3, 4, or 5)...'));

    return {
      success: true,
      post,
      sent: true,
      messageId: sendResult?.messages?.[0]?.id
    };
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

    if (!this.currentPendingPost) {
      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendText(
          fromNumber,
          '🤖 No pending post found. Reply with *NEW* to generate a fresh post for review!'
        );
      }
      return { error: 'NO_PENDING_POST' };
    }

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
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the ENGLISH version!'));

      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english);
      }
      return { action: 'APPROVED', language: 'English', post: post.english };
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
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the ROMAN URDU version!'));

      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendApprovalConfirmation(fromNumber, 'Roman Urdu', post.romanUrdu);
      }
      return { action: 'APPROVED', language: 'Roman Urdu', post: post.romanUrdu };
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
      console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner APPROVED the PLAIN URDU version!'));

      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendApprovalConfirmation(fromNumber, 'Plain Urdu', post.plainUrdu);
      }
      return { action: 'APPROVED', language: 'Plain Urdu', post: post.plainUrdu };
    }

    // 4. RETRY / REGENERATE
    if (input === '4' || input.includes('retry') || input.includes('new') || input === 'retry_post') {
      console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested REGENERATION. Generating fresh post...'));
      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendText(fromNumber, '⚡ Generating a fresh post for review. Stand by...');
      }
      return await this.generateAndSend();
    }

    // 5. DISCARD
    if (input === '5' || input.includes('discard') || input.includes('cancel')) {
      this.status = 'DISCARDED';
      this.currentPendingPost = null;
      console.log(ansi.dimText('\n✕ [WhatsApp Action] Owner DISCARDED the post.'));

      if (whatsappClient.isConfigured() && fromNumber) {
        await whatsappClient.sendText(
          fromNumber,
          '🗑️ Post discarded. Reply with *NEW* whenever you want to generate another post.'
        );
      }
      return { action: 'DISCARDED' };
    }

    // Unknown command
    if (whatsappClient.isConfigured() && fromNumber) {
      await whatsappClient.sendText(
        fromNumber,
        `🤖 *X_BOT Command Help:*\nReply with:\n• *1* ➔ Approve English\n• *2* ➔ Approve Roman Urdu\n• *3* ➔ Approve Plain Urdu\n• *4* ➔ Retry / Generate New\n• *5* ➔ Discard`
      );
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
