/**
 * Terminal UI Display and Formatting for X_BOT
 * Renders banners, post cards, character counts, and multilingual results cleanly.
 */

import { ansi } from '../utils/ansi.js';
import { calculateXCharacterCount } from '../utils/validation.js';

export class Display {
  /**
   * Main App Banner
   */
  static showBanner(mode = 'MANUAL') {
    console.clear();
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`                   ${ansi.emeraldText('X_BOT')} — CONTENT ENGINE`));
    console.log(ansi.dimText('      Multilingual Social Media Generator for X (Twitter)'));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(`  AI Provider: ${ansi.boldText('Grok Chat (Free Website)')}`);
    console.log(`  Current Mode: ${mode === 'AUTOMATED' ? ansi.badge('AUTOMATED GROK MODE', ansi.emeraldBg) : ansi.badge('MANUAL GROK MODE', ansi.bgGray)}`);
    console.log(`  Memory State: ${ansi.emeraldText('Pure In-Memory (Zero Storage / Zero DB)')}`);
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log('');
  }

  /**
   * Displays Content Generation Summary Header
   */
  static showGenerationHeader(topic, status, provider, count) {
    console.log('\n' + ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`              ${ansi.emeraldText('X_BOT CONTENT GENERATOR RESULTS')}`));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(`  ${ansi.boldText('TOPIC:')} ${topic}`);
    console.log(`  ${ansi.boldText('STATUS:')} ${status === 'SUCCESS' ? ansi.emeraldText('SUCCESS') : ansi.yellowText(status)}`);
    console.log(`  ${ansi.boldText('AI PROVIDER:')} ${provider}`);
    console.log(`  ${ansi.boldText('POST IDEAS GENERATED:')} ${count}`);
    console.log(ansi.separator('=', 64, ansi.emerald));
  }

  /**
   * Renders a single post card with all 3 language versions
   */
  static showPostIdea(idea) {
    const postNumPadded = String(idea.postNumber).padStart(2, '0');
    console.log('\n' + ansi.separator('-', 64, ansi.cyan));
    console.log(ansi.boldText(`  POST IDEA ${postNumPadded}`));
    console.log(ansi.separator('-', 64, ansi.cyan));

    // [1] ENGLISH
    this.renderLanguageSection(
      '[1] ENGLISH',
      idea.english,
      idea.approvedVersion === 'english',
      idea.englishRejected
    );

    console.log('\n' + ansi.separator('-', 64, ansi.gray));

    // [2] ROMAN URDU
    this.renderLanguageSection(
      '[2] ROMAN URDU',
      idea.romanUrdu,
      idea.approvedVersion === 'romanUrdu',
      idea.romanUrduRejected
    );

    console.log('\n' + ansi.separator('-', 64, ansi.gray));

    // [3] PLAIN URDU
    this.renderLanguageSection(
      '[3] PLAIN URDU (اردو)',
      idea.plainUrdu,
      idea.approvedVersion === 'plainUrdu',
      idea.plainUrduRejected
    );

    console.log('\n' + ansi.separator('-', 64, ansi.cyan));
  }

  /**
   * Renders a specific language section
   */
  static renderLanguageSection(title, data, isApproved = false, isRejected = false) {
    let statusBadge = ansi.dimText('[PENDING REVIEW]');
    if (isApproved) {
      statusBadge = ansi.badge('APPROVED', ansi.emeraldBg);
    } else if (isRejected) {
      statusBadge = ansi.badge('REJECTED', ansi.bgRed);
    }

    console.log(`\n  ${ansi.boldText(title)}  ${statusBadge}`);

    if (!data || !data.text) {
      console.log(`  ${ansi.yellowText('(Content missing or not parsed)')}`);
      return;
    }

    // Indented text for readability
    const indentedText = data.text
      .split('\n')
      .map(line => `    ${line}`)
      .join('\n');

    console.log(`\n${indentedText}`);

    if (data.hashtags) {
      console.log(`\n    ${ansi.cyanText(data.hashtags)}`);
    }

    // Character Counter
    const full = data.hashtags ? `${data.text}\n\n${data.hashtags}` : data.text;
    const countInfo = calculateXCharacterCount(full);

    const limitWarning = countInfo.isOverLimit
      ? ansi.redText(` [EXCEEDS 280 CHAR LIMIT: ${countInfo.weightedCount}/280]`)
      : ansi.emeraldText(` [${countInfo.weightedCount}/280 chars]`);

    console.log(`\n  ${ansi.dimText('Length:')}${limitWarning}`);
  }

  /**
   * Displays the Prompt Box for Manual Mode
   */
  static showManualPromptBox(promptText) {
    console.log('\n' + ansi.separator('=', 64, ansi.yellow));
    console.log(ansi.boldText(`  ${ansi.yellowText('MANUAL GROK PROMPT GENERATED')}`));
    console.log(ansi.separator('=', 64, ansi.yellow));
    console.log(ansi.dimText('  Follow these steps:'));
    console.log(`  1. Copy the prompt block below:`);
    console.log(`  2. Open ${ansi.boldText('https://grok.com')} in your browser.`);
    console.log(`  3. Paste the prompt and press Enter.`);
    console.log(`  4. When Grok finishes generating, copy Grok\'s response.`);
    console.log(`  5. Paste Grok\'s response into X_BOT below.`);
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(ansi.cyanText(promptText));
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(ansi.yellowText('  [End of Prompt — Ready to copy]'));
    console.log(ansi.separator('=', 64, ansi.yellow) + '\n');
  }

  /**
   * Displays single language regeneration prompt box
   */
  static showSingleLanguageRegenBox(language, promptText) {
    console.log('\n' + ansi.separator('=', 64, ansi.yellow));
    console.log(ansi.boldText(`  REGENERATION PROMPT FOR ${language.toUpperCase()}`));
    console.log(ansi.separator('=', 64, ansi.yellow));
    console.log(ansi.dimText('  Copy and paste this into Grok Chat, then paste the response back:'));
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(ansi.cyanText(promptText));
    console.log(ansi.separator('-', 64, ansi.gray));
  }

  /**
   * Displays Unicode explanation note
   */
  static showUnicodeNote() {
    console.log(ansi.dimText('\n  * Note: X (Twitter) weights standard Latin and Urdu characters as 1 unit, while'));
    console.log(ansi.dimText('    full-width CJK characters count as 2. All character counts reflect this standard.'));
  }

  /**
   * Content generation completed footer
   */
  static showCompletedFooter() {
    console.log('\n' + ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`              ${ansi.emeraldText('CONTENT GENERATION COMPLETED')}`));
    console.log(ansi.separator('=', 64, ansi.emerald) + '\n');
  }
}
