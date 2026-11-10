/**
 * Direct Instant Generation Flow for X_BOT
 * As soon as `npm start` runs:
 * 1. Auto-generates a post.
 * 2. Displays all 3 versions: [1] English, [2] Roman Urdu, [3] Plain Urdu.
 * 3. Prompts user to select:
 *    1: Keep English
 *    2: Keep Roman Urdu
 *    3: Keep Plain Urdu
 *    4: Retry (Regenerate new post)
 *    5: Discard / Exit
 */

import { generateMultilingualPost } from '../generator/aiService.js';
import { calculateXCharacterCount } from '../utils/validation.js';
import { ansi } from '../utils/ansi.js';
import { askQuestion, createInterface } from './input.js';

export class MenuController {
  constructor() {
    this.rl = null;
    this.currentPost = null;
  }

  async start() {
    this.rl = createInterface();

    // Check optional custom topic passed from CLI arguments (e.g. npm start "Bitcoin Halving")
    const customTopic = process.argv.slice(2).join(' ').trim();

    this.showBanner();

    let keepRunning = true;
    while (keepRunning) {
      await this.runGenerationCycle(customTopic);

      const decision = await this.promptAction();
      if (decision === 'exit') {
        keepRunning = false;
      }
    }

    console.log(`\n${ansi.emeraldText('Thank you for using X_BOT. Goodbye!')}\n`);
    this.rl.close();
    process.exit(0);
  }

  showBanner() {
    console.clear();
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`                   ${ansi.emeraldText('X_BOT')} — CONTENT ENGINE`));
    console.log(ansi.dimText('      Multilingual Social Media Generator for X (Twitter)'));
    console.log(ansi.separator('=', 64, ansi.emerald));

    const xaiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (xaiKey) {
      console.log(`  AI Engine: ${ansi.badge('xAI Grok API (Paid Mode)', ansi.emeraldBg)}`);
    } else if (groqKey) {
      console.log(`  AI Engine: ${ansi.badge('Groq Cloud API (Free Tier)', ansi.emeraldBg)}`);
    } else {
      console.log(`  AI Engine: ${ansi.badge('Free Multilingual Engine', ansi.emeraldBg)}`);
      console.log(ansi.dimText('  (Tip: Add free GROQ_API_KEY or paid GROK_API_KEY to .env for live API generation)'));
    }
    console.log(ansi.separator('=', 64, ansi.emerald) + '\n');
  }

  async runGenerationCycle(customTopic = '') {
    console.log(`${ansi.emeraldText('⚡ Auto-generating multilingual post...')}\n`);

    this.currentPost = await generateMultilingualPost(customTopic);

    console.log(ansi.separator('=', 64, ansi.cyan));
    console.log(ansi.boldText(`  TOPIC: ${ansi.cyanText(this.currentPost.topic)}`));
    console.log(`  Provider: ${ansi.dimText(this.currentPost.provider)}`);
    console.log(ansi.separator('=', 64, ansi.cyan));

    // [1] ENGLISH
    this.renderVersionCard(
      '[1] ENGLISH',
      this.currentPost.english.text,
      this.currentPost.english.hashtags,
      this.currentPost.english.weightedCount,
      this.currentPost.english.isOverLimit
    );

    console.log(ansi.separator('-', 64, ansi.gray));

    // [2] ROMAN URDU
    this.renderVersionCard(
      '[2] ROMAN URDU',
      this.currentPost.romanUrdu.text,
      this.currentPost.romanUrdu.hashtags,
      this.currentPost.romanUrdu.weightedCount,
      this.currentPost.romanUrdu.isOverLimit
    );

    console.log(ansi.separator('-', 64, ansi.gray));

    // [3] PLAIN URDU
    this.renderVersionCard(
      '[3] PLAIN URDU (اردو)',
      this.currentPost.plainUrdu.text,
      this.currentPost.plainUrdu.hashtags,
      this.currentPost.plainUrdu.weightedCount,
      this.currentPost.plainUrdu.isOverLimit
    );

    console.log(ansi.separator('=', 64, ansi.cyan));
  }

  renderVersionCard(title, text, hashtags, count, isOverLimit) {
    console.log(`\n  ${ansi.boldText(title)}`);

    // Indent text
    const indented = text.split('\n').map(l => `    ${l}`).join('\n');
    console.log(indented);

    if (hashtags) {
      console.log(`\n    ${ansi.cyanText(hashtags)}`);
    }

    const counter = isOverLimit
      ? ansi.redText(`[OVER LIMIT: ${count}/280 chars]`)
      : ansi.emeraldText(`[${count}/280 chars]`);

    console.log(`\n  ${ansi.dimText('Length:')} ${counter}`);
  }

  async promptAction() {
    console.log(`\n${ansi.boldText('SELECT AN OPTION:')}`);
    console.log(`  ${ansi.emeraldText('1.')} Keep English`);
    console.log(`  ${ansi.emeraldText('2.')} Keep Roman Urdu`);
    console.log(`  ${ansi.emeraldText('3.')} Keep Plain Urdu`);
    console.log(`  ${ansi.yellowText('4.')} Retry (Auto-generate another post)`);
    console.log(`  ${ansi.redText('5.')} Discard / Exit\n`);

    while (true) {
      const choice = await askQuestion(this.rl, `${ansi.emeraldText('Choose an option')} [1-5]: `);

      if (choice === '1') {
        this.displayKeptPost('ENGLISH', this.currentPost.english);
        return await this.askNextStep();
      } else if (choice === '2') {
        this.displayKeptPost('ROMAN URDU', this.currentPost.romanUrdu);
        return await this.askNextStep();
      } else if (choice === '3') {
        this.displayKeptPost('PLAIN URDU', this.currentPost.plainUrdu);
        return await this.askNextStep();
      } else if (choice === '4' || choice.toLowerCase() === 'retry' || choice.toLowerCase() === 'r') {
        console.log(`\n${ansi.yellowText('Retrying with a fresh post...')}\n`);
        return 'retry';
      } else if (choice === '5' || choice.toLowerCase() === 'discard' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
        console.log(`\n${ansi.dimText('Post discarded.')}`);
        return 'exit';
      } else {
        console.log(ansi.yellowText('Invalid option. Please enter 1, 2, 3, 4, or 5.'));
      }
    }
  }

  displayKeptPost(language, postData) {
    console.log('\n' + ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`  ✓ KEPT ${language} VERSION  ${ansi.badge('APPROVED FOR X', ansi.emeraldBg)}`));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log('\n' + ansi.boldText('Post ready to publish to X:'));
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(postData.text);
    if (postData.hashtags) {
      console.log('\n' + ansi.cyanText(postData.hashtags));
    }
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(`  Character Count: ${postData.weightedCount}/280 chars`);
    console.log(ansi.separator('=', 64, ansi.emerald));
  }

  async askNextStep() {
    const next = await askQuestion(this.rl, '\nGenerate another post? (y/N): ');
    if (next.toLowerCase() === 'y' || next.toLowerCase() === 'yes') {
      console.log('\n');
      return 'retry';
    }
    return 'exit';
  }
}
