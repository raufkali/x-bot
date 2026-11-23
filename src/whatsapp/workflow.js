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
import { markPostApproved, markPostDiscarded, markPostPublished, markPostUsed } from '../db/postModel.js';
import { historyStore } from '../db/historyStore.js';
import { xService } from '../x/xService.js';
import { getTrendingTopics, formatTrendsForWhatsApp } from '../generator/trendFetcher.js';

class WhatsAppWorkflowManager extends EventEmitter {
  constructor() {
    super();
    this.currentPendingPost = null; // { topic, category, english, romanUrdu, plainUrdu, activeView }
    this.approvedPost = null;
    this.status = 'IDLE'; // IDLE | AWAITING_GENERATE | AWAITING_APPROVAL | APPROVED | DISCARDED
    this.menuState = 'DEFAULT'; // DEFAULT | AWAITING_CUSTOM_TOPIC
  }

  /**
   * Generates 1 good English post and dispatches it to owner's WhatsApp with 7 options
   * @param {string} [customTopic]
   * @param {string} [excludedTopic]
   * @param {object} [excludedContext]
   * @param {boolean} [isUserForcedTopic] - When true the topic is exactly what the user typed (bypasses trend fetch)
   */
  async generateAndSend(customTopic = '', excludedTopic = '', excludedContext = null, isUserForcedTopic = false) {
    if (isUserForcedTopic && customTopic) {
      console.log(ansi.emeraldText(`⚡ Generating high-impact post for custom topic: "${customTopic}"...`));
    } else {
      console.log(ansi.emeraldText('⚡ Researching today\'s trending topic & generating high-impact post...'));
    }

    const gen = await generateEnglishPost(customTopic, excludedTopic, excludedContext, isUserForcedTopic);
    this.currentPendingPost = {
      topic: gen.topic,
      subtopic: gen.subtopic || gen.topic,
      category: gen.category || 'TRENDING',
      genreId: gen.genreId || 'TRENDING',
      mainSubject: gen.mainSubject,
      specificEventOrIssue: gen.specificEventOrIssue,
      centralArgument: gen.centralArgument,
      analyticalAngle: gen.analyticalAngle,
      importantStatistics: gen.importantStatistics,
      keywords: gen.keywords,
      english: gen.english,
      romanUrdu: null,
      plainUrdu: null,
      activeView: 'ENGLISH', // ENGLISH | ROMAN_URDU | PLAIN_URDU
      generatedAt: new Date().toISOString()
    };
    this.status = 'AWAITING_APPROVAL';
    this.menuState = 'DEFAULT';
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
      console.log(ansi.emeraldText('✓ English post sent to WhatsApp with action options!'));
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

      genResult = await this.generateAndSend(customTopic, '', null, Boolean(customTopic && customTopic.trim()));

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
    const tweetText = (versionObj.fullPost || `${versionObj.text}

${versionObj.hashtags || ''}`).trim();
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
   * Returns normalized list of authorized owner phone numbers from environment
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
      if (clean) {
        set.add(clean);
      }
    });

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
    // STRICT OWNER SECURITY GUARD:
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

    // GLOBAL COMMAND: EXIT / SLEEP
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

    // --- SUB-STATE: AWAITING CUSTOM TOPIC ---
    if (this.menuState === 'AWAITING_CUSTOM_TOPIC') {
      if (input === '0' || input === 'cancel' || input === 'back') {
        this.menuState = 'DEFAULT';
        this.status = 'AWAITING_GENERATE';
        const backMsg =
          `👋 *Main Menu:*\n\n` +
          `• *1* ➔ Generate post about today's trend\n` +
          `• *2* ➔ View today's trending topics\n` +
          `• *3* ➔ Write about a custom topic`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, backMsg); } catch (e) {}
        }
        return { action: 'MENU_CANCELLED', message: backMsg };
      }

      const userTopic = rawInput.trim();
      this.menuState = 'DEFAULT';
      this.status = 'AWAITING_GENERATE';
      console.log(ansi.emeraldText(`\n✍️ [WhatsApp Action] Owner requested custom topic: "${userTopic}"`));
      if (whatsappClient.isConfigured() && fromNumber) {
        try {
          await whatsappClient.sendText(fromNumber, `✍️ Writing a post about: *"${userTopic}"*\n⚡ Generating... Please wait.`);
        } catch (e) {}
      }
      return await this.generateAndSend(userTopic, '', null, true); // isUserForcedTopic = true
    }

    // ------------------------------------------------------------
    // SCENARIO 1: NO PENDING POST
    // ------------------------------------------------------------
    if (!this.currentPendingPost) {
      // Option 1: Generate post about today's trend
      if (input === '1' || input === 'new' || input === 'generate' || input === 'start' || input === 'trend') {
        console.log(ansi.emeraldText('\n⟳ [WhatsApp Action] Owner pressed 1 to generate trending post...'));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Researching today\'s trending topic & generating 1 good post. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend();
      }

      // Option 2: View today's trending topics
      if (input === '2' || input === 'trends' || input === 'trending' || input === 'view trends') {
        console.log(ansi.emeraldText('\n📈 [WhatsApp Action] Owner requested today\'s trending topics...'));
        const trends = await getTrendingTopics();
        const trendsMsg = formatTrendsForWhatsApp(trends);
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, trendsMsg); } catch (e) {}
        }
        return { action: 'TRENDS_LIST', trends, message: trendsMsg };
      }

      // Option 3: Open custom topic mode OR direct prefixed custom topic ("topic: ...", "write about ...", "3 <topic>")
      const prefixedMatch = rawInput.trim().match(/^(?:topic\s*:|write\s+about\s+|post\s+about\s+|custom\s*:\s*|3\s+)(.+)$/i);
      if (prefixedMatch && prefixedMatch[1] && prefixedMatch[1].trim().length >= 3) {
        const directTopic = prefixedMatch[1].trim();
        console.log(ansi.emeraldText(`\n✍️ [WhatsApp Action] Owner provided direct custom topic: "${directTopic}"`));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, `✍️ Writing a post about: *"${directTopic}"*\n⚡ Generating... Please wait.`);
          } catch (e) {}
        }
        return await this.generateAndSend(directTopic, '', null, true);
      }

      if (input === '3' || input === 'custom topic' || input === 'write about a custom topic' || input === 'custom') {
        this.menuState = 'AWAITING_CUSTOM_TOPIC';
        console.log(ansi.emeraldText('\n✍️ [WhatsApp Action] Owner opened custom topic mode...'));
        const askMsg =
          `✍️ *Custom Topic Post*\n\n` +
          `Reply with any topic you want the bot to write about.\n\n` +
          `_Or reply *0* to cancel._`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, askMsg); } catch (e) {}
        }
        return { action: 'AWAITING_CUSTOM_TOPIC', message: askMsg };
      }

      // Direct topic input without pressing 3 first (ignore greetings/wake-ups/menu commands so "Hi"/"Hello there!" still shows menu, while even short topics like "ai" trigger directly)
      const strippedInput = input.replace(/[!?.]+$/g, '').trim();
      const isGreetingOrWake = /^(?:hi+|he+y+|hello(?:\s+there|\s+bot|\s+assistant)?|yo|sup|salam|assalam(?:\s*o?\s*alaikum)?|asalam|aoa|good\s+(?:morning|afternoon|evening|night)|how\s+are\s+you|menu|help|status|wake(?:\s+up)?|ok|okay|thanks|thank\s+you|please|\?+)$/i.test(
        strippedInput
      );
      const isMenuOrControlWord = /^(?:\d+|yes|no|y|n|cancel|back|exit|quit|sleep|stop|new|generate|start|trend|trends|trending|view trends|custom|custom topic|write about a custom topic)$/i.test(
        strippedInput
      );
      const hasTopicLetters = /[\p{L}]{2,}/u.test(strippedInput);
      const looksLikeDirectCustomTopic = !isGreetingOrWake && !isMenuOrControlWord && hasTopicLetters;

      if (looksLikeDirectCustomTopic) {
        const directTopic = rawInput.trim();
        console.log(ansi.emeraldText(`\n✍️ [WhatsApp Action] Owner typed custom topic directly: "${directTopic}"`));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, `✍️ Writing about current trends in: *"${directTopic}"*\n⚡ Generating... Please wait.`);
          } catch (e) {}
        }
        return await this.generateAndSend(directTopic, '', null, true);
      }

      // Greetings or wake-up messages send the welcome menu
      this.status = 'AWAITING_GENERATE';
      this.menuState = 'DEFAULT';
      console.log(ansi.emeraldText('\n👋 [WhatsApp Action] Bot woken up by owner! Sending welcome greeting...'));
      const welcomeMsg =
        `HI, welcome to your X Assistant press 1 to generate new post or 2 to view trends\n\n` +
        `• *1* ➔ Generate post about today's trend\n` +
        `• *2* ➔ View today's trending topics\n` +
        `• *3* ➔ Write about a custom topic (or just type any topic directly!)`;

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
    // SCENARIO 2: PENDING POST EXISTS (Menu with action options)
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

      // Option 2: Generate in Plain Urdu script
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

      // Option 3: Approve English and post to live X
      if (input === '3' || input.includes('approve') || input.includes('post') || input.includes('yes')) {
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
              '🗑️ Post discarded.\n\n• *1* ➔ Generate post about today\'s trend\n• *2* ➔ View today\'s trending topics\n• *3* ➔ Write about a custom topic'
            );
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }

        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // Option 5: Generate a brand NEW fresh post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post...'));
        const oldTopic = post.topic;
        const oldContext = {
          subject: post.mainSubject || oldTopic,
          argument: post.centralArgument || '',
          statistics: post.importantStatistics || post.numbers || []
        };
        markPostDiscarded(oldTopic).catch(() => {});
        historyStore.markDiscarded(oldTopic);
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Researching another trend & generating fresh post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend('', oldTopic, oldContext);
      }

      // Option 6: View today's trending topics
      if (input === '6' || input.includes('trends') || input.includes('trending')) {
        console.log(ansi.emeraldText('\n📈 [WhatsApp Action] Owner requested today\'s trending topics from post review...'));
        const trends = await getTrendingTopics();
        const trendsMsg =
          formatTrendsForWhatsApp(trends) +
          `\n\n_Reply *0* to return to your pending post review._`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, trendsMsg); } catch (e) {}
        }
        return { action: 'TRENDS_LIST', trends, message: trendsMsg };
      }

      // Option 0: Return to active post review
      if (input === '0' || input === 'back') {
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendEnglishPostForReview(fromNumber, post); } catch (e) {}
        }
        return { action: 'RETURNED_TO_POST_REVIEW', post };
      }

      // Option 7: Mark post as used (never reuse)
      if (input === '7' || input.includes('mark') || input.includes('used') || input.includes('never')) {
        console.log(ansi.emeraldText('\n🔒 [WhatsApp Action] Owner MARKED POST AS USED (permanently indexed and avoided)...'));
        const usedPost = { ...post };
        this.status = 'MARKED_USED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);

        historyStore.markUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        });
        markPostUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        }).catch(() => {});

        const confirmMsg =
          `🔒 Post marked as USED permanently. Its topic, argument, and content will never be reused or regenerated.\n\n` +
          `• *1* ➔ Generate post about today's trend\n` +
          `• *2* ➔ View today's trending topics\n` +
          `• *3* ➔ Write about a custom topic`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, confirmMsg);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        const decision = { action: 'MARKED_USED', status: 'MARKED_USED', topic: usedPost.topic, post: usedPost, message: confirmMsg };
        this.emit('owner_decision', decision);
        return decision;
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

      // 2: Generate / Switch to Plain Urdu
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
        this.approvedPost = { language: 'English', content: post.english, topic: post.topic, approvedAt: new Date().toISOString() };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'English').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner approved & posted English version from Roman Urdu view!'));

        const tweetDetails = await this.publishToX('English', post.english, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english, tweetDetails); } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard') || input.includes('cancel')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostDiscarded(post.topic).catch(() => {});
        console.log(ansi.dimText('\n✕ [WhatsApp Action] Owner DISCARDED the post from Roman Urdu view.'));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(
              fromNumber,
              '🗑️ Post discarded.\n\n• *1* ➔ Generate post about today\'s trend\n• *2* ➔ View today\'s trending topics\n• *3* ➔ Write about a custom topic'
            );
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Generate a brand NEW fresh post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post from Roman Urdu view...'));
        const oldTopic = post.topic;
        const oldContext = {
          subject: post.mainSubject || oldTopic,
          argument: post.centralArgument || '',
          statistics: post.importantStatistics || post.numbers || []
        };
        markPostDiscarded(oldTopic).catch(() => {});
        historyStore.markDiscarded(oldTopic);
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Researching another trend & generating fresh post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend('', oldTopic, oldContext);
      }

      // Option 6: View today's trending topics
      if (input === '6' || input.includes('trends') || input.includes('trending')) {
        const trends = await getTrendingTopics();
        const trendsMsg =
          formatTrendsForWhatsApp(trends) +
          `\n\n_Reply *0* to return to your pending post review._`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, trendsMsg); } catch (e) {}
        }
        return { action: 'TRENDS_LIST', trends, message: trendsMsg };
      }

      // Option 0: Return to active review
      if (input === '0' || input === 'back') {
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendRomanUrduVersion(fromNumber, post); } catch (e) {}
        }
        return { action: 'RETURNED_TO_POST_REVIEW', post };
      }

      // Option 7: Mark post as used (never reuse)
      if (input === '7' || input.includes('mark') || input.includes('used') || input.includes('never')) {
        console.log(ansi.emeraldText('\n🔒 [WhatsApp Action] Owner MARKED POST AS USED from Roman Urdu view (permanently indexed and avoided)...'));
        const usedPost = { ...post };
        this.status = 'MARKED_USED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);

        historyStore.markUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        });
        markPostUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        }).catch(() => {});

        const confirmMsg =
          `🔒 Post marked as USED permanently. Its topic, argument, and content will never be reused or regenerated.\n\n` +
          `• *1* ➔ Generate post about today's trend\n` +
          `• *2* ➔ View today's trending topics\n` +
          `• *3* ➔ Write about a custom topic`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, confirmMsg);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        const decision = { action: 'MARKED_USED', status: 'MARKED_USED', topic: usedPost.topic, post: usedPost, message: confirmMsg };
        this.emit('owner_decision', decision);
        return decision;
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
        this.approvedPost = { language: 'English', content: post.english, topic: post.topic, approvedAt: new Date().toISOString() };
        this.status = 'APPROVED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostApproved(post.topic, 'English').catch(() => {});
        console.log(ansi.emeraldText('\n✓ [WhatsApp Action] Owner approved & posted English version from Plain Urdu view!'));

        const tweetDetails = await this.publishToX('English', post.english, post.topic);
        this.approvedPost.tweet = tweetDetails;

        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendApprovalConfirmation(fromNumber, 'English', post.english, tweetDetails); } catch (e) {}
        }
        const decision = { action: 'APPROVED', status: 'APPROVED', language: 'English', approvedPost: post.english, topic: post.topic, tweet: tweetDetails };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 4: Discard
      if (input === '4' || input.includes('discard') || input.includes('cancel')) {
        this.status = 'DISCARDED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);
        markPostDiscarded(post.topic).catch(() => {});
        console.log(ansi.dimText('\n✕ [WhatsApp Action] Owner DISCARDED the post from Plain Urdu view.'));
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(
              fromNumber,
              '🗑️ Post discarded.\n\n• *1* ➔ Generate post about today\'s trend\n• *2* ➔ View today\'s trending topics\n• *3* ➔ Write about a custom topic'
            );
          } catch (e) {}
        }
        const decision = { action: 'DISCARDED', status: 'DISCARDED', topic: post.topic };
        this.emit('owner_decision', decision);
        return decision;
      }

      // 5: Generate a brand NEW fresh post
      if (input === '5' || input.includes('retry') || input.includes('regen') || input.includes('new') || input.includes('fresh')) {
        console.log(ansi.yellowText('\n⟳ [WhatsApp Action] Owner requested a completely NEW fresh post from Plain Urdu view...'));
        const oldTopic = post.topic;
        const oldContext = {
          subject: post.mainSubject || oldTopic,
          argument: post.centralArgument || '',
          statistics: post.importantStatistics || post.numbers || []
        };
        markPostDiscarded(oldTopic).catch(() => {});
        historyStore.markDiscarded(oldTopic);
        this.currentPendingPost = null;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, '⚡ Researching another trend & generating fresh post for you. Stand by...');
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        return await this.generateAndSend('', oldTopic, oldContext);
      }

      // Option 6: View today's trending topics
      if (input === '6' || input.includes('trends') || input.includes('trending')) {
        const trends = await getTrendingTopics();
        const trendsMsg =
          formatTrendsForWhatsApp(trends) +
          `\n\n_Reply *0* to return to your pending post review._`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendText(fromNumber, trendsMsg); } catch (e) {}
        }
        return { action: 'TRENDS_LIST', trends, message: trendsMsg };
      }

      // Option 0: Return to active review
      if (input === '0' || input === 'back') {
        if (whatsappClient.isConfigured() && fromNumber) {
          try { await whatsappClient.sendPlainUrduVersion(fromNumber, post); } catch (e) {}
        }
        return { action: 'RETURNED_TO_POST_REVIEW', post };
      }

      // Option 7: Mark post as used (never reuse)
      if (input === '7' || input.includes('mark') || input.includes('used') || input.includes('never')) {
        console.log(ansi.emeraldText('\n🔒 [WhatsApp Action] Owner MARKED POST AS USED from Plain Urdu view (permanently indexed and avoided)...'));
        const usedPost = { ...post };
        this.status = 'MARKED_USED';
        this.currentPendingPost = null;
        keepAliveService.setWaitingForResponse(false);

        historyStore.markUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        });
        markPostUsed(usedPost.topic, {
          genreId: usedPost.genreId || usedPost.category,
          subtopic: usedPost.subtopic || usedPost.topic,
          mainSubject: usedPost.mainSubject,
          specificEventOrIssue: usedPost.specificEventOrIssue,
          centralArgument: usedPost.centralArgument,
          analyticalAngle: usedPost.analyticalAngle,
          importantStatistics: usedPost.importantStatistics,
          keywords: usedPost.keywords,
          english: usedPost.english
        }).catch(() => {});

        const confirmMsg =
          `🔒 Post marked as USED permanently. Its topic, argument, and content will never be reused or regenerated.\n\n` +
          `• *1* ➔ Generate post about today's trend\n` +
          `• *2* ➔ View today's trending topics\n` +
          `• *3* ➔ Write about a custom topic`;
        if (whatsappClient.isConfigured() && fromNumber) {
          try {
            await whatsappClient.sendText(fromNumber, confirmMsg);
          } catch (e) {
            console.warn('[WhatsApp Send Warning]', e.message);
          }
        }
        const decision = { action: 'MARKED_USED', status: 'MARKED_USED', topic: usedPost.topic, post: usedPost, message: confirmMsg };
        this.emit('owner_decision', decision);
        return decision;
      }
    }

    // Default help response
    if (whatsappClient.isConfigured() && fromNumber) {
      try {
        await whatsappClient.sendText(
          fromNumber,
          `🤖 *X ASSISTANT — POST REVIEW*\nReply with:\n• *1* ➔ Generate in Roman Urdu\n• *2* ➔ Generate in Urdu (اردو)\n• *3* ➔ Post directly to X\n• *4* ➔ Discard post\n• *5* ➔ Generate a NEW fresh post\n• *6* ➔ 📈 View today's trending topics\n• *7* ➔ 🔒 Mark post as used (never reuse)`
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
export const generateAndSendToWhatsApp = (topic) =>
  whatsappWorkflow.generateAndSend(topic, '', null, Boolean(topic && String(topic).trim()));
