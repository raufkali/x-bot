/**
 * Terminal Menu and Flow Controller for X_BOT
 */

import { ContentGenerator } from '../generator/contentGenerator.js';
import { checkBrowserAvailability } from '../generator/grokBrowser.js';
import { validateTopic } from '../utils/validation.js';
import { ansi } from '../utils/ansi.js';
import { Display } from './display.js';
import { askQuestion, askChoice, readMultiLine, createInterface } from './input.js';

// Preloaded official test topic from specification
const SPEC_TEST_TOPIC = `By 2035, the world will not be run by one country. Many countries will share power.

AI will be like electricity. Money will be digital. Minerals will be the new petrol. Food and seeds will be power.

In short, power will mean five things: data, energy, minerals, food, and payment systems.`;

const TONES = [
  'Informative',
  'Educational',
  'Professional',
  'Conversational',
  'Analytical',
  'Opinion-based'
];

const AUDIENCES = [
  'General Public',
  'Technology Enthusiasts',
  'Students',
  'Professionals',
  'Business Audience'
];

const POST_COUNTS = [
  '1. One post (3 language versions)',
  '2. Five posts (15 language versions)',
  '3. Ten posts (30 language versions)'
];

export class MenuController {
  constructor() {
    this.generator = new ContentGenerator();
    this.currentMode = 'MANUAL'; // Default fallback safe mode
    this.rl = null;
  }

  /**
   * Starts the CLI Application
   */
  async start() {
    this.rl = createInterface();

    // Check environment availability
    const status = await checkBrowserAvailability();
    this.currentMode = status.available ? 'AUTOMATED' : 'MANUAL';

    while (true) {
      Display.showBanner(this.currentMode);

      console.log(ansi.boldText('MAIN MENU:'));
      console.log(`  ${ansi.emeraldText('1.')} Generate New Content`);
      console.log(`  ${ansi.emeraldText('2.')} Quick Test with Spec Topic (Future of Power 2035)`);
      console.log(`  ${ansi.emeraldText('3.')} Toggle Grok Mode (Current: ${this.currentMode})`);
      console.log(`  ${ansi.emeraldText('4.')} Exit\n`);

      const choice = await askQuestion(this.rl, `${ansi.emeraldText('Choose an option')} [1-4]: `);

      if (choice === '1') {
        await this.handleContentGeneration();
      } else if (choice === '2') {
        await this.handleContentGeneration(SPEC_TEST_TOPIC);
      } else if (choice === '3') {
        await this.toggleMode();
      } else if (choice === '4' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
        console.log(`\n${ansi.emeraldText('Exiting X_BOT. Goodbye!')}\n`);
        this.rl.close();
        process.exit(0);
      } else {
        console.log(ansi.yellowText('\nInvalid option. Please choose 1, 2, 3, or 4.'));
        await this.pause();
      }
    }
  }

  /**
   * Toggle between Automated and Manual Grok Mode
   */
  async toggleMode() {
    console.log('\n' + ansi.separator('-', 50, ansi.gray));
    if (this.currentMode === 'AUTOMATED') {
      this.currentMode = 'MANUAL';
      console.log(ansi.emeraldText('Switched to MANUAL GROK MODE.'));
      console.log(ansi.dimText('In Manual Mode, X_BOT generates the exact prompt for you to copy into grok.com and parse.'));
    } else {
      console.log('Testing automated browser connectivity...');
      const check = await checkBrowserAvailability();
      if (check.available) {
        this.currentMode = 'AUTOMATED';
        console.log(ansi.emeraldText('Switched to AUTOMATED GROK MODE.'));
      } else {
        console.log(ansi.yellowText(`Automated browser not reachable: ${check.message}`));
        const force = await askQuestion(this.rl, 'Do you want to enable Automated Mode anyway? (y/N): ');
        if (force.toLowerCase() === 'y') {
          this.currentMode = 'AUTOMATED';
          console.log(ansi.emeraldText('Automated Mode enabled.'));
        } else {
          console.log(ansi.dimText('Remaining in Manual Mode.'));
        }
      }
    }
    await this.pause();
  }

  /**
   * Handles the complete content generation flow
   */
  async handleContentGeneration(prefilledTopic = null) {
    console.clear();
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`             ${ansi.emeraldText('NEW CONTENT GENERATION REQUEST')}`));
    console.log(ansi.separator('=', 64, ansi.emerald));

    let topic = prefilledTopic;
    if (!topic) {
      console.log(`\n${ansi.boldText('TOPIC / IDEA:')}`);
      console.log(ansi.dimText('Enter your topic, idea, news, or message. (Type END on a new line if pasting multi-line text):'));
      topic = await readMultiLine(this.rl, 'Topic Input:');
    } else {
      console.log(`\n${ansi.boldText('PRELOADED SPEC TOPIC:')}\n${ansi.dimText(topic)}`);
    }

    const val = validateTopic(topic);
    if (!val.valid) {
      console.log(`\n${ansi.redText(`Error: ${val.error}`)}`);
      await this.pause();
      return;
    }

    // Additional Instructions
    console.log(`\n${ansi.boldText('ADDITIONAL INSTRUCTIONS (Optional):')}`);
    const additionalInstructions = await askQuestion(this.rl, 'Add specific instructions or things to avoid (press Enter to skip): ');

    // Tone Selection
    const selectedTone = await askChoice(this.rl, 'SELECT TONE:', TONES, 1);

    // Target Audience Selection
    const selectedAudience = await askChoice(this.rl, 'SELECT TARGET AUDIENCE:', AUDIENCES, 1);

    // Number of Post Ideas Selection
    const postCountChoice = await askChoice(this.rl, 'SELECT NUMBER OF POST IDEAS:', POST_COUNTS, 1);
    let numberOfPosts = 1;
    if (postCountChoice.includes('Five')) numberOfPosts = 5;
    else if (postCountChoice.includes('Ten')) numberOfPosts = 10;

    // Build the master prompt
    const prompt = this.generator.createPrompt({
      topic,
      additionalInstructions,
      tone: selectedTone,
      audience: selectedAudience,
      numberOfPosts
    });

    this.generator.setSession({
      topic,
      additionalInstructions,
      tone: selectedTone,
      audience: selectedAudience,
      numberOfPosts,
      ideas: [],
      lastPrompt: prompt,
      mode: this.currentMode
    });

    let generationSucceeded = false;

    // Try Automated Mode first if enabled
    if (this.currentMode === 'AUTOMATED') {
      console.log('\n' + ansi.separator('-', 64, ansi.emerald));
      console.log(ansi.boldText('Running Automated Grok Generation...'));

      const autoResult = await this.generator.tryAutomatedGeneration(
        prompt,
        numberOfPosts,
        (statusMsg) => console.log(`  ${ansi.emeraldText('→')} ${statusMsg}`)
      );

      if (autoResult.success) {
        generationSucceeded = true;
        this.generator.getSession().ideas = autoResult.ideas;
      } else {
        console.log(`\n${ansi.yellowText(`[Automated Generation Notice] ${autoResult.error}`)}`);
        console.log(ansi.dimText('Falling back to Manual Grok Mode...\n'));
      }
    }

    // Manual Grok Workflow
    if (!generationSucceeded) {
      Display.showManualPromptBox(prompt);

      while (!generationSucceeded) {
        const rawPasted = await readMultiLine(this.rl, "Paste Grok's complete response here:");
        if (!rawPasted.trim()) {
          const retry = await askQuestion(this.rl, 'No response entered. Try again? (Y/n): ');
          if (retry.toLowerCase() === 'n') return;
          continue;
        }

        console.log('\nParsing response into English, Roman Urdu, and Plain Urdu...');
        const parseResult = this.generator.processManualResponse(rawPasted, numberOfPosts);

        if (parseResult.success) {
          generationSucceeded = true;
          if (parseResult.errors && parseResult.errors.length > 0) {
            console.log(ansi.yellowText(`Note during parsing: ${parseResult.errors.join('; ')}`));
          }
        } else {
          console.log(`\n${ansi.redText('Could not parse response structure.')}`);
          if (parseResult.errors) {
            parseResult.errors.forEach(e => console.log(ansi.redText(`  - ${e}`)));
          }
          const tryAgain = await askQuestion(this.rl, 'Would you like to re-paste the response? (Y/n): ');
          if (tryAgain.toLowerCase() === 'n') {
            return;
          }
        }
      }
    }

    // Display Results
    await this.renderCurrentSessionResults();

    // Enter Post-generation Action Loop
    await this.handlePostGenerationActions();
  }

  /**
   * Renders the current session's generated posts
   */
  async renderCurrentSessionResults() {
    const session = this.generator.getSession();
    if (!session || !session.ideas || session.ideas.length === 0) return;

    Display.showGenerationHeader(
      session.topic.length > 50 ? `${session.topic.slice(0, 50)}...` : session.topic,
      'SUCCESS',
      'GROK CHAT',
      session.ideas.length
    );

    for (const idea of session.ideas) {
      Display.showPostIdea(idea);
    }

    Display.showUnicodeNote();
    Display.showCompletedFooter();
  }

  /**
   * Loop for actions after generation (regenerate, edit, approve, reject)
   */
  async handlePostGenerationActions() {
    while (true) {
      console.log(`\n${ansi.boldText('WHAT WOULD YOU LIKE TO DO?')}`);
      console.log(`  ${ansi.emeraldText('1.')} Generate another topic`);
      console.log(`  ${ansi.emeraldText('2.')} Regenerate all posts`);
      console.log(`  ${ansi.emeraldText('3.')} Regenerate English only`);
      console.log(`  ${ansi.emeraldText('4.')} Regenerate Roman Urdu only`);
      console.log(`  ${ansi.emeraldText('5.')} Regenerate Plain Urdu only`);
      console.log(`  ${ansi.emeraldText('6.')} Simulate Approval / Rejection`);
      console.log(`  ${ansi.emeraldText('7.')} View current posts again`);
      console.log(`  ${ansi.emeraldText('8.')} Exit to Main Menu\n`);

      const action = await askQuestion(this.rl, `${ansi.emeraldText('Choose an action')} [1-8]: `);

      if (action === '1') {
        return; // Return to main menu to generate another topic
      } else if (action === '2') {
        await this.handleRegenerateAll();
      } else if (action === '3') {
        await this.handleRegenerateSingle('English');
      } else if (action === '4') {
        await this.handleRegenerateSingle('Roman Urdu');
      } else if (action === '5') {
        await this.handleRegenerateSingle('Plain Urdu');
      } else if (action === '6') {
        await this.handleApprovalWorkflow();
      } else if (action === '7') {
        await this.renderCurrentSessionResults();
      } else if (action === '8') {
        return;
      } else {
        console.log(ansi.yellowText('Invalid option. Please choose between 1 and 8.'));
      }
    }
  }

  /**
   * Handles regeneration of a single language version
   */
  async handleRegenerateSingle(language) {
    const session = this.generator.getSession();
    if (!session || session.ideas.length === 0) return;

    let targetPostNum = 1;
    if (session.ideas.length > 1) {
      const postNumStr = await askQuestion(this.rl, `Enter Post Idea number to regenerate [1-${session.ideas.length}]: `);
      const parsed = parseInt(postNumStr, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= session.ideas.length) {
        targetPostNum = parsed;
      }
    }

    console.log(`\n${ansi.boldText(`Regenerating ${language} for Post Idea ${String(targetPostNum).padStart(2, '0')}`)}`);
    const feedback = await askQuestion(this.rl, 'What should be improved? (e.g. "Make it shorter and use simpler words", or Enter to skip): ');

    const regenPrompt = this.generator.createSingleLanguageRegenPrompt(language, targetPostNum, feedback);

    Display.showSingleLanguageRegenBox(language, regenPrompt);

    const pasted = await readMultiLine(this.rl, `Paste regenerated ${language} response from Grok:`);
    if (!pasted.trim()) {
      console.log(ansi.yellowText('Regeneration skipped (empty input).'));
      return;
    }

    const result = this.generator.processSingleLanguageRegen(pasted, targetPostNum, language);
    if (result.success) {
      console.log(`\n${ansi.emeraldText(`✓ Successfully regenerated ${language} for Post Idea ${String(targetPostNum).padStart(2, '0')}!`)}`);
      Display.showPostIdea(result.updatedIdea);
    } else {
      console.log(`\n${ansi.redText(`Regeneration failed: ${result.error}`)}`);
    }
  }

  /**
   * Handles regeneration of all posts
   */
  async handleRegenerateAll() {
    const session = this.generator.getSession();
    if (!session) return;

    console.log(`\n${ansi.boldText('Regenerating All Post Ideas')}`);
    const feedback = await askQuestion(this.rl, 'What should be improved? (Optional feedback, or press Enter): ');

    const prompt = this.generator.createPrompt({
      topic: session.topic,
      additionalInstructions: feedback ? `${session.additionalInstructions} Note: ${feedback}` : session.additionalInstructions,
      tone: session.tone,
      audience: session.audience,
      numberOfPosts: session.numberOfPosts
    });

    Display.showManualPromptBox(prompt);

    const pasted = await readMultiLine(this.rl, "Paste Grok's newly generated response:");
    if (!pasted.trim()) {
      console.log(ansi.yellowText('Regeneration cancelled (empty response).'));
      return;
    }

    const parseResult = this.generator.processManualResponse(pasted, session.numberOfPosts);
    if (parseResult.success) {
      console.log(`\n${ansi.emeraldText('✓ All post ideas successfully regenerated!')}`);
      await this.renderCurrentSessionResults();
    } else {
      console.log(`\n${ansi.redText(`Regeneration parsing failed: ${parseResult.errors.join('; ')}`)}`);
    }
  }

  /**
   * Simulates WhatsApp owner approval workflow
   */
  async handleApprovalWorkflow() {
    const session = this.generator.getSession();
    if (!session || session.ideas.length === 0) return;

    console.log('\n' + ansi.separator('=', 64, ansi.cyan));
    console.log(ansi.boldText(`       ${ansi.cyanText('APPROVAL WORKFLOW SIMULATION (WhatsApp Bot Demo)')}`));
    console.log(ansi.separator('=', 64, ansi.cyan));
    console.log(ansi.dimText('Simulates how the owner will receive 3 versions, review, approve or reject one.'));

    let targetPostNum = 1;
    if (session.ideas.length > 1) {
      const numStr = await askQuestion(this.rl, `Select Post Idea to review [1-${session.ideas.length}]: `);
      const parsed = parseInt(numStr, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= session.ideas.length) {
        targetPostNum = parsed;
      }
    }

    const idea = session.ideas.find(i => i.postNumber === targetPostNum) || session.ideas[0];
    Display.showPostIdea(idea);

    console.log(`\n${ansi.boldText('Choose an action for Post Idea ' + String(targetPostNum).padStart(2, '0') + ':')}`);
    console.log(`  ${ansi.emeraldText('1.')} Approve [1] English`);
    console.log(`  ${ansi.emeraldText('2.')} Approve [2] Roman Urdu`);
    console.log(`  ${ansi.emeraldText('3.')} Approve [3] Plain Urdu`);
    console.log(`  ${ansi.yellowText('4.')} Reject a version`);
    console.log(`  ${ansi.dimText('5.')} Back`);

    const action = await askQuestion(this.rl, `${ansi.emeraldText('Select action')} [1-5]: `);

    if (action === '1') {
      this.generator.setApproval(targetPostNum, 'english', 'APPROVED');
      console.log(ansi.emeraldText('\n✓ Marked [1] English as APPROVED! (No publishing executed in Part 1)'));
    } else if (action === '2') {
      this.generator.setApproval(targetPostNum, 'romanUrdu', 'APPROVED');
      console.log(ansi.emeraldText('\n✓ Marked [2] Roman Urdu as APPROVED! (No publishing executed in Part 1)'));
    } else if (action === '3') {
      this.generator.setApproval(targetPostNum, 'plainUrdu', 'APPROVED');
      console.log(ansi.emeraldText('\n✓ Marked [3] Plain Urdu as APPROVED! (No publishing executed in Part 1)'));
    } else if (action === '4') {
      console.log('\nWhich version to reject? 1: English, 2: Roman Urdu, 3: Plain Urdu');
      const rejChoice = await askQuestion(this.rl, 'Choice [1-3]: ');
      const keyMap = { '1': 'english', '2': 'romanUrdu', '3': 'plainUrdu' };
      if (keyMap[rejChoice]) {
        this.generator.setApproval(targetPostNum, keyMap[rejChoice], 'REJECTED');
        console.log(ansi.redText(`\n✓ Marked ${keyMap[rejChoice]} as REJECTED.`));
      }
    }

    Display.showPostIdea(idea);
    await this.pause();
  }

  /**
   * Helper to pause and wait for user keypress
   */
  pause() {
    return new Promise((resolve) => {
      this.rl.question(ansi.dimText('\nPress Enter to continue...'), () => resolve());
    });
  }
}
