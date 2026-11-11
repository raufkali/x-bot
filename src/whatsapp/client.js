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
  async sendPayload(payload, retries = 2) {
    if (!this.isConfigured()) {
      throw new Error(
        'WhatsApp Cloud API credentials not configured. Please set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.'
      );
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
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
      } catch (err) {
        lastError = err;
        // If it's a direct API rejection from Meta (e.g. 400/403/404), do not retry
        if (err.message && err.message.startsWith('WhatsApp API failed')) {
          throw err;
        }
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  /**
   * Sends a pre-approved WhatsApp template message
   * @param {string} to - Recipient number
   * @param {string} [templateName] - Template name (defaults to config.whatsappTemplateName)
   * @param {string} [languageCode] - Language code (defaults to config.whatsappTemplateLang)
   * @param {Array} [components] - Optional template components (header, body parameters)
   */
  async sendTemplate(to, templateName = config.whatsappTemplateName, languageCode = config.whatsappTemplateLang, components = []) {
    const formattedTo = String(to).replace(/[^0-9]/g, '');
    const templatePayload = {
      name: templateName,
      language: {
        code: languageCode
      }
    };

    if (components && components.length > 0) {
      templatePayload.components = components;
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: formattedTo,
      type: 'template',
      template: templatePayload
    };

    return this.sendPayload(payload);
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
   * Formats and sends 1 good English post with the 5 options:
   * 1- generate in Roman Urdu
   * 2- generate in Urdu
   * 3- Post directly in English
   * 4- Discard post
   * 5- regenerate the post
   * @param {string} to 
   * @param {object} post 
   */
  async sendEnglishPostForReview(to, post) {
    const english = post.english || post;
    const message = `🇬🇧 *NEW POST (ENGLISH)*

📌 *Topic:* ${post.topic || 'Trending Topic'}

━━━━━━━━━━━━━━━━━━━━
${english.text}

${english.hashtags || ''}
━━━━━━━━━━━━━━━━━━━━
_Length: ${english.weightedCount}/280 chars_

Reply with:
• *1* ➔ Generate in Roman Urdu
• *2* ➔ Generate in Urdu
• *3* ➔ Post directly in English
• *4* ➔ Discard post
• *5* ➔ Regenerate the post`;

    return this.sendText(to, message);
  }

  /**
   * Sends Roman Urdu version with action options
   */
  async sendRomanUrduVersion(to, post) {
    const message = `🇵🇰 *ROMAN URDU VERSION*

📌 *Topic:* ${post.topic || ''}

━━━━━━━━━━━━━━━━━━━━
${post.romanUrdu.text}

${post.romanUrdu.hashtags || ''}
━━━━━━━━━━━━━━━━━━━━
_Length: ${post.romanUrdu.weightedCount}/280 chars_

Reply with:
• *1* ➔ Approve & Post Roman Urdu
• *2* ➔ Generate in Urdu (اردو)
• *3* ➔ Post English directly
• *4* ➔ Discard post
• *5* ➔ Regenerate Roman Urdu`;

    return this.sendText(to, message);
  }

  /**
   * Sends Plain Urdu version with action options
   */
  async sendPlainUrduVersion(to, post) {
    const message = `🇵🇰 *URDU VERSION (اردو)*

📌 *Topic:* ${post.topic || ''}

━━━━━━━━━━━━━━━━━━━━
${post.plainUrdu.text}

${post.plainUrdu.hashtags || ''}
━━━━━━━━━━━━━━━━━━━━
_Length: ${post.plainUrdu.weightedCount}/280 chars_

Reply with:
• *1* ➔ Approve & Post Urdu
• *2* ➔ Generate in Roman Urdu
• *3* ➔ Post English directly
• *4* ➔ Discard post
• *5* ➔ Regenerate Urdu`;

    return this.sendText(to, message);
  }

  /**
   * Alias for backward compatibility
   */
  async sendPostForReview(to, post) {
    return this.sendEnglishPostForReview(to, post);
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
