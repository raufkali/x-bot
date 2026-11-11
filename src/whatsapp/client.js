/**
 * Meta WhatsApp Cloud API Client
 * Sends messages, templates, and interactive button messages to the owner.
 */

import { config } from '../config.js';

export class WhatsAppClient {
  constructor() {
    this.token = config.whatsappToken;
    this.phoneNumberId = config.whatsappPhoneNumberId;
    this.apiVersion = config.graphApiVersion;
    this.apiUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Validates if WhatsApp Cloud API credentials are configured
   */
  isConfigured() {
    return Boolean(this.token && this.phoneNumberId);
  }

  /**
   * Sends raw payload to Meta WhatsApp Cloud API
   */
  async sendPayload(payload) {
    if (!this.isConfigured()) {
      throw new Error(
        'WhatsApp Cloud API credentials not configured. Please set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.'
      );
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMsg = responseData?.error?.message || response.statusText;
      console.error('[WhatsApp API Error]', responseData);
      throw new Error(`WhatsApp API failed (${response.status}): ${errorMsg}`);
    }

    return responseData;
  }

  /**
   * Sends a simple text message
   */
  async sendText(to, text) {
    const formattedTo = String(to).replace(/[^0-9]/g, '');
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    };
    return this.sendPayload(payload);
  }

  /**
   * Sends an interactive button message (up to 3 buttons)
   * @param {string} to - Recipient number
   * @param {string} bodyText - Main message body
   * @param {Array<{ id: string, title: string }>} buttons - Max 3 buttons
   */
  async sendInteractiveButtons(to, bodyText, buttons) {
    const formattedTo = String(to).replace(/[^0-9]/g, '');

    const formattedButtons = buttons.slice(0, 3).map((btn) => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title.slice(0, 20) // Meta max 20 chars per button title
      }
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText
        },
        action: {
          buttons: formattedButtons
        }
      }
    };

    return this.sendPayload(payload);
  }

  /**
   * Formats and sends a generated 3-language post for owner review
   * @param {string} to 
   * @param {object} post 
   */
  async sendPostForReview(to, post) {
    const message = `🤖 *X_BOT — New Post Approval Request*

📌 *Topic:* ${post.topic}

━━━━━━━━━━━━━━━━━━━━
🇬🇧 *[1] ENGLISH POST:*
${post.english.text}

${post.english.hashtags}
_Length: ${post.english.weightedCount}/280 chars_

━━━━━━━━━━━━━━━━━━━━
🇵🇰 *[2] ROMAN URDU:*
${post.romanUrdu.text}

${post.romanUrdu.hashtags}
_Length: ${post.romanUrdu.weightedCount}/280 chars_

━━━━━━━━━━━━━━━━━━━━
🇵🇰 *[3] PLAIN URDU (اردو):*
${post.plainUrdu.text}

${post.plainUrdu.hashtags}
_Length: ${post.plainUrdu.weightedCount}/280 chars_

━━━━━━━━━━━━━━━━━━━━
*Select an action:*
Reply with:
• *1* ➔ Approve English
• *2* ➔ Approve Roman Urdu
• *3* ➔ Approve Plain Urdu
• *4* ➔ Retry / Regenerate
• *5* ➔ Discard`;

    // Try interactive buttons first (Approve English, Roman Urdu, Plain Urdu)
    try {
      const buttons = [
        { id: 'approve_english', title: '1. Approve English' },
        { id: 'approve_roman', title: '2. Approve Roman' },
        { id: 'approve_urdu', title: '3. Approve Urdu' }
      ];
      return await this.sendInteractiveButtons(to, message, buttons);
    } catch (err) {
      // If interactive buttons fail (e.g. 24h window or tier restriction), fallback to plain text message
      console.warn('[WhatsApp] Falling back to standard text message for review...');
      return await this.sendText(to, message);
    }
  }

  /**
   * Sends confirmation when owner approves a version
   */
  async sendApprovalConfirmation(to, language, approvedVersion) {
    const confirmation = `✅ *POST APPROVED FOR X (TWITTER)!*

Language: *${language}*
Status: *Ready for Publishing*

━━━━━━━━━━━━━━━━━━━━
*Content:*
${approvedVersion.text}

${approvedVersion.hashtags}
━━━━━━━━━━━━━━━━━━━━
_Length: ${approvedVersion.weightedCount}/280 chars_

_(In Part 2 this will automatically post to your X account.)_`;

    return this.sendText(to, confirmation);
  }
}

export const whatsappClient = new WhatsAppClient();
