/**
 * Meta WhatsApp Cloud API Client
 * Sends messages, templates, and interactive button messages to the owner.
 */

import { config } from '../config.js';
import { ansi } from '../utils/ansi.js';

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
          const errorCode = responseData?.error?.code;
          const errorSubcode = responseData?.error?.error_subcode;
          const fbTraceId = responseData?.error?.fbtrace_id;

          console.error(ansi.redText('\n❌ [WhatsApp Cloud API Error from Meta]'));
          console.error(`   HTTP Status:     ${response.status}`);
          console.error(`   Error Message:   ${errorMsg}`);
          console.error(`   Error Code:      ${errorCode ?? 'N/A'}`);
          console.error(`   Error Subcode:   ${errorSubcode ?? 'N/A'}`);
          console.error(`   FBTrace ID:      ${fbTraceId ?? 'N/A'}`);
          console.error(`   Phone Number ID: ${this.phoneNumberId}`);
          console.error(`   Recipient:       ${payload?.to}`);

          if (errorMsg.includes('API access blocked')) {
            console.warn(ansi.yellowText('\n   [TROUBLESHOOTING TIP — API Access Blocked]'));
            console.warn(ansi.yellowText('   1. Check your WhatsApp Phone Number status:'));
            console.warn(ansi.yellowText('      https://business.facebook.com/wa/manage/phone-numbers/'));
            console.warn(ansi.yellowText('   2. Verify Meta Business Suite -> Account Quality for restrictions or pending verification.'));
            console.warn(ansi.yellowText('   3. Ensure System User Token has active "whatsapp_business_messaging" permission.'));
          }

          const errorDetails =
            responseData?.error?.error_data?.details ||
            responseData?.error?.error_user_msg ||
            responseData?.error?.error_subcode ||
            '';
          const errorSummary = errorDetails ? `${errorMsg} (${errorDetails})` : errorMsg;

          throw new Error(`WhatsApp API failed (${response.status}): ${errorSummary}`);
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
   * Cleans recipient phone number and protects against self-messaging
   */
  formatRecipient(to) {
    let clean = String(to || config.ownerPhoneNumber || '923435022880').replace(/[^0-9]/g, '');
    // A bot cannot send WhatsApp messages to its own registered phone number
    if (clean === '923290958704') {
      console.warn('[WhatsApp Route] Recipient is the bot\'s own number (+92 329 0958704). Auto-rerouting to owner (+92 343 5022880).');
      clean = '923435022880';
    }
    return clean;
  }

  /**
   * Sends a pre-approved WhatsApp template message
   * @param {string} to - Recipient number
   * @param {string} [templateName] - Template name (defaults to config.whatsappTemplateName)
   * @param {string} [languageCode] - Language code (defaults to config.whatsappTemplateLang)
   * @param {Array} [components] - Optional template components (header, body parameters)
   */
  async sendTemplate(to, templateName = config.whatsappTemplateName, languageCode = config.whatsappTemplateLang, components = []) {
    const formattedTo = this.formatRecipient(to);
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
    const formattedTo = this.formatRecipient(to);
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
    const formattedTo = this.formatRecipient(to);

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
   * Formats and sends 1 descriptive story post with the 5 options:
   * 1- generate in Roman Urdu
   * 2- generate in Urdu
   * 3- Post directly to X
   * 4- Discard post
   * 5- Generate a NEW fresh post
   * @param {string} to 
   * @param {object} post 
   */
  async sendEnglishPostForReview(to, post) {
    const english = post.english || post;
    const body = english.fullPost || english.text;
    const message = `🇬🇧 *NEW STORY POST (ENGLISH)*

📌 *Topic:* ${post.topic || 'Trending Insight'}

━━━━━━━━━━━━━━━━━━━━
${body}
━━━━━━━━━━━━━━━━━━━━
_Length: ${english.charCount || english.weightedCount || body.length} characters_

Reply with:
• *1* ➔ Generate in Roman Urdu
• *2* ➔ Generate in Urdu (اردو)
• *3* ➔ Post directly to X (Twitter)
• *4* ➔ Discard post
• *5* ➔ Generate a NEW fresh post`;

    return this.sendText(to, message);
  }

  /**
   * Sends Roman Urdu story version with action options
   */
  async sendRomanUrduVersion(to, post) {
    const body = post.romanUrdu.fullPost || post.romanUrdu.text;
    const message = `🇵🇰 *ROMAN URDU VERSION*

📌 *Topic:* ${post.topic || ''}

━━━━━━━━━━━━━━━━━━━━
${body}
━━━━━━━━━━━━━━━━━━━━
_Length: ${post.romanUrdu.charCount || post.romanUrdu.weightedCount || body.length} characters_

Reply with:
• *1* ➔ Approve & Post Roman Urdu to X
• *2* ➔ Generate in Urdu (اردو)
• *3* ➔ Post English directly to X
• *4* ➔ Discard post
• *5* ➔ Generate a NEW fresh post`;

    return this.sendText(to, message);
  }

  /**
   * Sends Plain Urdu story version with action options
   */
  async sendPlainUrduVersion(to, post) {
    const body = post.plainUrdu.fullPost || post.plainUrdu.text;
    const message = `🇵🇰 *URDU VERSION (اردو)*

📌 *Topic:* ${post.topic || ''}

━━━━━━━━━━━━━━━━━━━━
${body}
━━━━━━━━━━━━━━━━━━━━
_Length: ${post.plainUrdu.charCount || post.plainUrdu.weightedCount || body.length} characters_

Reply with:
• *1* ➔ Approve & Post Urdu to X
• *2* ➔ Generate in Roman Urdu
• *3* ➔ Post English directly to X
• *4* ➔ Discard post
• *5* ➔ Generate a NEW fresh post`;

    return this.sendText(to, message);
  }

  /**
   * Alias for backward compatibility
   */
  async sendPostForReview(to, post) {
    return this.sendEnglishPostForReview(to, post);
  }

  /**
   * Sends confirmation when owner approves a version (with live X URL or error status)
   */
  async sendApprovalConfirmation(to, language, approvedVersion, tweetDetails = null) {
    let confirmation;
    const bodyContent = approvedVersion.fullPost || `${approvedVersion.text}\n\n${approvedVersion.hashtags || ''}`.trim();
    const lengthCount = approvedVersion.weightedCount || approvedVersion.charCount || 240;

    if (tweetDetails && tweetDetails.url) {
      const username = tweetDetails.username ? `@${tweetDetails.username}` : 'X';
      confirmation = `🚀 *POST PUBLISHED TO X (TWITTER)!*

👤 *Account:* ${username}
🌐 *Language:* ${language}
🔗 *Live Tweet:* ${tweetDetails.url}

━━━━━━━━━━━━━━━━━━━━
${bodyContent}
━━━━━━━━━━━━━━━━━━━━
_Length: ${lengthCount}/280 chars_`;
    } else if (tweetDetails && tweetDetails.error) {
      if (tweetDetails.isRechargeNeeded) {
        confirmation = `💳 *RECHARGE YOUR X ACCOUNT FOR POSTING*

⚠️ *Post was approved, but X rejected publishing:*
Your X (Twitter) Developer monthly post limit or credits have been reached.

💡 *Action Required:* Please recharge your X account or upgrade your X Developer API credits at https://developer.x.com/ to resume posting.

━━━━━━━━━━━━━━━━━━━━
🌐 *Approved Content (${language}):*
${bodyContent}
━━━━━━━━━━━━━━━━━━━━`;
      } else {
        confirmation = `⚠️ *POST APPROVED BUT FAILED TO PUBLISH TO X*

🌐 *Language:* ${language}
❌ *Error:* ${tweetDetails.error}
💡 *Fix:* Visit https://x-bot-7p2s.onrender.com/auth/x to reconnect.

━━━━━━━━━━━━━━━━━━━━
${bodyContent}
━━━━━━━━━━━━━━━━━━━━`;
      }
    } else {
      confirmation = `✅ *POST APPROVED FOR X (TWITTER)!*

🌐 *Language:* ${language}
Status: *Ready for Publishing*

━━━━━━━━━━━━━━━━━━━━
${bodyContent}
━━━━━━━━━━━━━━━━━━━━
_Length: ${lengthCount}/280 chars_`;
    }

    return this.sendText(to, confirmation);
  }
}

export const whatsappClient = new WhatsAppClient();
