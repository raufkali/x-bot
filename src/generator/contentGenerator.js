/**
 * Content Generation Engine for X_BOT
 * Coordinates prompt construction, AI interaction (Automated or Manual), and response parsing.
 * Keeps all data strictly in-memory.
 */

import { buildGenerationPrompt, buildSingleLanguageRegenPrompt, buildAllLanguagesRegenPrompt } from './promptBuilder.js';
import { parseGrokResponse, parseSingleLanguageRegen } from './responseParser.js';
import { generateWithGrokBrowser, checkBrowserAvailability } from './grokBrowser.js';
import { config } from '../config.js';

export class ContentGenerator {
  constructor() {
    this.currentSession = null;
  }

  /**
   * Initializes or updates current runtime state (in-memory only)
   */
  setSession(data) {
    this.currentSession = {
      topic: data.topic,
      additionalInstructions: data.additionalInstructions || '',
      tone: data.tone || config.defaultTone,
      audience: data.audience || config.defaultAudience,
      numberOfPosts: data.numberOfPosts || 1,
      ideas: data.ideas || [],
      lastPrompt: data.lastPrompt || '',
      mode: data.mode || 'MANUAL'
    };
  }

  getSession() {
    return this.currentSession;
  }

  /**
   * Generates master prompt for a topic
   */
  createPrompt(params) {
    return buildGenerationPrompt(params);
  }

  /**
   * Generates prompt for single language regeneration
   */
  createSingleLanguageRegenPrompt(language, postNumber, feedback = '') {
    if (!this.currentSession) return '';
    const idea = this.currentSession.ideas.find(i => i.postNumber === postNumber) || this.currentSession.ideas[0];
    return buildSingleLanguageRegenPrompt({
      originalTopic: this.currentSession.topic,
      language,
      postNumber,
      currentIdea: idea,
      feedback,
      tone: this.currentSession.tone,
      audience: this.currentSession.audience
    });
  }

  /**
   * Generates prompt for all-languages regeneration of a post
   */
  createAllLanguagesRegenPrompt(postNumber, feedback = '') {
    if (!this.currentSession) return '';
    const idea = this.currentSession.ideas.find(i => i.postNumber === postNumber) || this.currentSession.ideas[0];
    return buildAllLanguagesRegenPrompt({
      originalTopic: this.currentSession.topic,
      postNumber,
      currentIdea: idea,
      feedback,
      tone: this.currentSession.tone,
      audience: this.currentSession.audience
    });
  }

  /**
   * Attempts automated generation via Grok Chat
   * @param {string} prompt 
   * @param {Function} statusCallback 
   * @returns {Promise<{ success: boolean, ideas?: Array, rawText?: string, error?: string, requiresManual: boolean }>}
   */
  async tryAutomatedGeneration(prompt, expectedCount = 1, statusCallback = () => {}) {
    const result = await generateWithGrokBrowser(prompt, statusCallback);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        requiresManual: result.requiresManual
      };
    }

    const parsed = parseGrokResponse(result.rawText, expectedCount);
    if (!parsed.success) {
      return {
        success: false,
        rawText: result.rawText,
        error: `Could not parse Grok response into structured languages: ${parsed.errors.join('; ')}`,
        requiresManual: true
      };
    }

    return {
      success: true,
      ideas: parsed.ideas,
      rawText: result.rawText,
      requiresManual: false
    };
  }

  /**
   * Processes manually pasted Grok response
   * @param {string} rawPastedText 
   * @param {number} expectedCount 
   * @returns {{ success: boolean, ideas: Array, errors: string[] }}
   */
  processManualResponse(rawPastedText, expectedCount = 1) {
    const parsed = parseGrokResponse(rawPastedText, expectedCount);
    if (parsed.success && this.currentSession) {
      this.currentSession.ideas = parsed.ideas;
    }
    return parsed;
  }

  /**
   * Processes manual single-language regeneration response
   * @param {string} rawPastedText 
   * @param {number} postNumber 
   * @param {string} language - 'english' | 'romanUrdu' | 'plainUrdu'
   * @returns {{ success: boolean, updatedIdea?: object, error?: string }}
   */
  processSingleLanguageRegen(rawPastedText, postNumber, language) {
    const parsed = parseSingleLanguageRegen(rawPastedText, language);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }

    if (!this.currentSession) {
      return { success: false, error: 'No active session found.' };
    }

    const idea = this.currentSession.ideas.find(i => i.postNumber === postNumber);
    if (!idea) {
      return { success: false, error: `Post #${postNumber} not found in session.` };
    }

    // Map language key
    const key = language.toLowerCase().includes('roman')
      ? 'romanUrdu'
      : (language.toLowerCase().includes('plain') || language.toLowerCase().includes('urdu'))
      ? 'plainUrdu'
      : 'english';

    idea[key] = parsed.parsed;
    idea.approvedVersion = null; // Reset approval when regenerated

    return { success: true, updatedIdea: idea };
  }

  /**
   * Updates text of an idea (for editing simulation)
   */
  updatePostText(postNumber, languageKey, newText) {
    if (!this.currentSession) return false;
    const idea = this.currentSession.ideas.find(i => i.postNumber === postNumber);
    if (!idea || !idea[languageKey]) return false;

    idea[languageKey].text = newText;
    const full = idea[languageKey].hashtags ? `${newText}\n\n${idea[languageKey].hashtags}` : newText;
    const counts = calculateXCharacterCount(full);
    idea[languageKey].charCount = counts.charCount;
    idea[languageKey].weightedCount = counts.weightedCount;
    idea[languageKey].isOverLimit = counts.isOverLimit;
    idea.approvedVersion = null; // Reset approval status on edit
    return true;
  }

  /**
   * Sets approval status
   */
  setApproval(postNumber, languageKey, status = 'APPROVED') {
    if (!this.currentSession) return false;
    const idea = this.currentSession.ideas.find(i => i.postNumber === postNumber);
    if (!idea) return false;

    if (status === 'APPROVED') {
      idea.approvedVersion = languageKey;
    } else if (status === 'REJECTED') {
      if (idea.approvedVersion === languageKey) {
        idea.approvedVersion = null;
      }
      idea[`${languageKey}Rejected`] = true;
    }
    return true;
  }
}
