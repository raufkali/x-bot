/**
 * Direct Workflow for X_BOT:
 * 1. Automatically creates a rich, substantial English post on `npm start`.
 * 2. Displays the English post.
 * 3. Lets you generate / regenerate Roman Urdu or Plain Urdu directly from it.
 * 4. Lets you select which version to finalize and post to X.
 */

import {
  generateEnglishPost,
  generateRomanUrduFromEnglish,
  generatePlainUrduFromEnglish
} from '../generator/aiService.js';
import { ansi } from '../utils/ansi.js';
import { askQuestion, createInterface } from './input.js';

export class MenuController {
  constructor() {
    this.rl = null;
    this.currentTopic = '';
    this.provider = '';
    this.english = null;
    this.romanUrdu = null;
    this.plainUrdu = null;
  }

  async start() {
    this.rl = createInterface();

    const customTopic = process.argv.slice(2).join(' ').trim();
    this.showBanner();

    let keepRunning = true;

    // 1. Automatically generate the initial rich English post
    await this.generateEnglish(customTopic);

    // 2. Interactive action loop
    while (keepRunning) {
      this.displayCurrentState();

      console.log(`\n${ansi.boldText('CHOOSE AN ACTION:')}`);
      console.log(`  ${ansi.emeraldText('1.')} Generate / Regenerate in Roman Urdu`);
      console.log(`  ${ansi.emeraldText('2.')} Generate / Regenerate in Plain Urdu (اردو)`);
      console.log(`  ${ansi.emeraldText('3.')} Generate Both Roman Urdu & Plain Urdu`);
      console.log(`  ${ansi.yellowText('4.')} Regenerate English Post (New angle / topic)`);
      console.log(`  ${ansi.cyanText('5.')} Select Post to Publish to X`);
      console.log(`  ${ansi.redText('6.')} Discard / Exit\n`);

      const choice = await askQuestion(this.rl, `${ansi.emeraldText('Choose an option')} [1-6]: `);

      if (choice === '1') {
        await this.generateRomanUrdu();
      } else if (choice === '2') {
        await this.generatePlainUrdu();
      } else if (choice === '3') {
        await this.generateBothUrdu();
      } else if (choice === '4') {
        await this.generateEnglish();
      } else if (choice === '5') {
        const next = await this.handlePostOption();
        if (next === 'exit') keepRunning = false;
      } else if (choice === '6' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
        keepRunning = false;
      } else {
        console.log(ansi.yellowText('Invalid option. Please choose between 1 and 6.'));
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
      console.log(ansi.dimText('  (Tip: Set GROQ_API_KEY for free Groq or GROK_API_KEY for paid Grok in .env)'));
    }
    console.log(ansi.separator('=', 64, ansi.emerald) + '\n');
  }

  async generateEnglish(customTopic = '') {
    console.log(`${ansi.emeraldText('⚡ Creating substantial English post...')}\n`);
    const res = await generateEnglishPost(customTopic);
    this.currentTopic = res.topic;
    this.english = res.english;
    this.provider = res.provider;
    this.romanUrdu = null;
    this.plainUrdu = null;
  }

  async generateRomanUrdu() {
    console.log(`\n${ansi.emeraldText('⚡ Generating conversational Roman Urdu version from English post...')}`);
    this.romanUrdu = await generateRomanUrduFromEnglish(this.english, this.currentTopic);
    console.log(ansi.emeraldText('✓ Roman Urdu version ready!'));
  }

  async generatePlainUrdu() {
    console.log(`\n${ansi.emeraldText('⚡ Generating proper Plain Urdu script (اردو) version from English post...')}`);
    this.plainUrdu = await generatePlainUrduFromEnglish(this.english, this.currentTopic);
    console.log(ansi.emeraldText('✓ Plain Urdu version ready!'));
  }

  async generateBothUrdu() {
    console.log(`\n${ansi.emeraldText('⚡ Generating both Roman Urdu and Plain Urdu versions...')}`);
    this.romanUrdu = await generateRomanUrduFromEnglish(this.english, this.currentTopic);
    this.plainUrdu = await generatePlainUrduFromEnglish(this.english, this.currentTopic);
    console.log(ansi.emeraldText('✓ Both Urdu versions generated successfully!'));
  }

  displayCurrentState() {
    console.log('\n' + ansi.separator('=', 64, ansi.cyan));
    console.log(ansi.boldText(`  TOPIC: ${ansi.cyanText(this.currentTopic)}`));
    console.log(`  Provider: ${ansi.dimText(this.provider)}`);
    console.log(ansi.separator('=', 64, ansi.cyan));

    // [1] ENGLISH POST
    this.renderCard('[1] ENGLISH POST', this.english);

    // [2] ROMAN URDU (if generated)
    if (this.romanUrdu) {
      console.log(ansi.separator('-', 64, ansi.gray));
      this.renderCard('[2] ROMAN URDU', this.romanUrdu);
    }

    // [3] PLAIN URDU (if generated)
    if (this.plainUrdu) {
      console.log(ansi.separator('-', 64, ansi.gray));
      this.renderCard('[3] PLAIN URDU (اردو)', this.plainUrdu);
    }

    console.log(ansi.separator('=', 64, ansi.cyan));
  }

  renderCard(title, postData) {
    if (!postData) return;
    console.log(`\n  ${ansi.boldText(title)}`);

    const indented = postData.text.split('\n').map(l => `    ${l}`).join('\n');
    console.log(indented);

    if (postData.hashtags) {
      console.log(`\n    ${ansi.cyanText(postData.hashtags)}`);
    }

    const counter = postData.isOverLimit
      ? ansi.cyanText(`[${postData.weightedCount} chars — Long-Form X Post / Thread]`)
      : ansi.emeraldText(`[${postData.weightedCount}/280 chars — Fits Standard X Post]`);

    console.log(`\n  ${ansi.dimText('Length:')} ${counter}`);
  }

  async handlePostOption() {
    console.log('\n' + ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`         ${ansi.emeraldText('SELECT A VERSION TO POST ON X')}`));
    console.log(ansi.separator('=', 64, ansi.emerald));

    console.log(`  ${ansi.emeraldText('1.')} Post English version`);
    if (this.romanUrdu) {
      console.log(`  ${ansi.emeraldText('2.')} Post Roman Urdu version`);
    } else {
      console.log(`  ${ansi.dimText('2. Roman Urdu (Not generated yet — choose option 1 in main menu)')}`);
    }
    if (this.plainUrdu) {
      console.log(`  ${ansi.emeraldText('3.')} Post Plain Urdu version`);
    } else {
      console.log(`  ${ansi.dimText('3. Plain Urdu (Not generated yet — choose option 2 in main menu)')}`);
    }
    console.log(`  ${ansi.dimText('4. Back to menu')}`);

    const pick = await askQuestion(this.rl, `\n${ansi.emeraldText('Choose version')} [1-4]: `);

    let chosen = null;
    let label = '';

    if (pick === '1' && this.english) {
      chosen = this.english;
      label = 'ENGLISH';
    } else if (pick === '2' && this.romanUrdu) {
      chosen = this.romanUrdu;
      label = 'ROMAN URDU';
    } else if (pick === '3' && this.plainUrdu) {
      chosen = this.plainUrdu;
      label = 'PLAIN URDU';
    } else if (pick === '4') {
      return 'menu';
    } else {
      console.log(ansi.yellowText('Selected version is not generated yet.'));
      return 'menu';
    }

    console.log('\n' + ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`  ✓ FINALIZED ${label} POST  ${ansi.badge('APPROVED FOR X', ansi.emeraldBg)}`));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log('\n' + ansi.boldText('Ready to publish on X:'));
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(chosen.text);
    if (chosen.hashtags) {
      console.log('\n' + ansi.cyanText(chosen.hashtags));
    }
    console.log(ansi.separator('-', 64, ansi.gray));
    console.log(`  Length: ${chosen.weightedCount}/280 chars`);
    console.log(ansi.separator('=', 64, ansi.emerald));

    const next = await askQuestion(this.rl, '\nWould you like to start a new post? (y/N): ');
    if (next.toLowerCase() === 'y' || next.toLowerCase() === 'yes') {
      await this.generateEnglish();
      return 'menu';
    }
    return 'exit';
  }
}
