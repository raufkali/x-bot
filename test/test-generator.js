/**
 * Test Suite for X_BOT Multilingual Content Generation Engine
 * Tests parsing, character weighting, prompt building, multi-post scaling, and in-memory operations.
 */

import assert from 'assert';
import { buildGenerationPrompt, buildSingleLanguageRegenPrompt, buildAllLanguagesRegenPrompt } from '../src/generator/promptBuilder.js';
import { parseGrokResponse, parseSingleLanguageRegen } from '../src/generator/responseParser.js';
import { calculateXCharacterCount, validateTopic } from '../src/utils/validation.js';
import { ContentGenerator } from '../src/generator/contentGenerator.js';

console.log('====================================================');
console.log('           RUNNING X_BOT TEST SUITE');
console.log('====================================================\n');

// Sample test topic from specification
const SPEC_TEST_TOPIC = `By 2035, the world will not be run by one country. Many countries will share power.

AI will be like electricity. Money will be digital. Minerals will be the new petrol. Food and seeds will be power.

In short, power will mean five things: data, energy, minerals, food, and payment systems.`;

// Sample simulated Grok output for 1 post idea
const SAMPLE_GROK_OUTPUT_1 = `
POST 01

ENGLISH:
Post text: By 2035, the world will not be controlled by just one country. Power will be shared among several nations. AI will become like electricity, money will move digitally, minerals will replace oil, and food security will define geopolitics. The five pillars of the new era are data, energy, minerals, food, and payment rails.
Hashtags: #AI #FutureOfTechnology #GlobalPower
Character count: 320

ROMAN URDU:
Post text: 2035 tak duniya par sirf aik mulk ka control nahi hoga. Mukhtalif mulkon ke paas apni taqat hogi. AI bijli ki tarah aam aur zaroori ho jaye gi, paisa digital hoga, aur minerals naye petrol ka darja le lenge. Mustaqbil ki asal taqat 5 cheezon par munhasir hogi: data, energy, minerals, khana aur payment systems.
Hashtags: #AI #Mustaqbil #Technology

PLAIN URDU:
Post text: ۲۰۳۵ تک دنیا پر صرف ایک ملک کا کنٹرول نہیں ہوگا۔ مختلف ممالک کے پاس اپنی طاقت ہوگی۔ مصنوعی ذہانت بجلی کی طرح عام اور ضروری ہو جائے گی۔ پیسہ ڈیجیٹل ہوگا، معدنیات نئے تیل کی مانند اہمیت پائیں گی اور خوراک طاقت بنے گی۔ مستقبل کی طاقت پانچ چیزوں پر منحصر ہے: ڈیٹا، توانائی، معدنیات، خوراک اور ادائیگی کے نظام۔
Hashtags: #AI #مستقبل #ٹیکنالوجی
`;

// Helper to generate simulated output for N post ideas
function generateSimulatedOutputForN(count) {
  let output = '';
  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(2, '0');
    output += `
POST ${pad}

ENGLISH:
Post text: Test English post idea ${i} covering future geopolitics and AI infrastructure.
Hashtags: #AI #Tech${i}

ROMAN URDU:
Post text: Yeh test Roman Urdu post number ${i} hai jo AI aur digital technology par mabni hai.
Hashtags: #Urdu #Tech${i}

PLAIN URDU:
Post text: یہ اردو کی پوسٹ نمبر ${i} ہے جو جدید ٹیکنالوجی اور مصنوعی ذہانت کے بارے میں ہے۔
Hashtags: #اردو #ٹیکنالوجی
`;
  }
  return output;
}

// TEST 1: Topic Validation
console.log('TEST 1: Validating Topic Input...');
assert.strictEqual(validateTopic('').valid, false, 'Empty topic should fail');
assert.strictEqual(validateTopic('abc').valid, false, 'Too short topic should fail');
assert.strictEqual(validateTopic(SPEC_TEST_TOPIC).valid, true, 'Valid topic should pass');
console.log('✓ TEST 1 PASSED: Topic validation working as expected.\n');

// TEST 2: Character Counter & Unicode Weighting
console.log('TEST 2: Testing X Character Counter & Unicode Weighting...');
const shortText = 'Hello world! #AI';
const shortCount = calculateXCharacterCount(shortText);
assert.strictEqual(shortCount.isOverLimit, false);
assert.strictEqual(shortCount.charCount, shortText.length);

const urduSample = '۲۰۳۵ تک دنیا پر صرف ایک ملک کا کنٹرول نہیں ہوگا۔';
const urduCount = calculateXCharacterCount(urduSample);
assert.strictEqual(urduCount.isOverLimit, false);
assert.ok(urduCount.charCount > 0);

const longText = 'a'.repeat(1010);
const longCount = calculateXCharacterCount(longText);
assert.strictEqual(longCount.isOverLimit, true, 'Over 1000 characters should trigger isOverLimit');
console.log('✓ TEST 2 PASSED: Character counting and Unicode weighting working.\n');

// TEST 3: Prompt Building (1, 5, 10 Posts)
console.log('TEST 3: Testing Prompt Building for 1, 5, and 10 posts...');
const prompt1 = buildGenerationPrompt({ topic: SPEC_TEST_TOPIC, numberOfPosts: 1 });
assert.ok(prompt1.includes('POST 01'), 'Prompt 1 should contain POST 01');
assert.ok(prompt1.includes('ROMAN URDU'), 'Prompt 1 should contain ROMAN URDU');
assert.ok(prompt1.includes('PLAIN URDU'), 'Prompt 1 should contain PLAIN URDU');

const prompt5 = buildGenerationPrompt({ topic: SPEC_TEST_TOPIC, numberOfPosts: 5 });
assert.ok(prompt5.includes('POST 05'), 'Prompt 5 should contain POST 05');
assert.ok(prompt5.includes('5 DISTINCT post ideas'), 'Prompt 5 should state 5 distinct ideas');

const prompt10 = buildGenerationPrompt({ topic: SPEC_TEST_TOPIC, numberOfPosts: 10 });
assert.ok(prompt10.includes('POST 10'), 'Prompt 10 should contain POST 10');
assert.ok(prompt10.includes('10 DISTINCT post ideas'), 'Prompt 10 should state 10 distinct ideas');
console.log('✓ TEST 3 PASSED: Prompt builder accurately constructs prompts for 1, 5, and 10 posts.\n');

// TEST 4: Parsing 1 Post Idea with 3 Languages
console.log('TEST 4: Parsing 1 Post Idea (English, Roman Urdu, Plain Urdu)...');
const parsed1 = parseGrokResponse(SAMPLE_GROK_OUTPUT_1, 1);
assert.strictEqual(parsed1.success, true);
assert.strictEqual(parsed1.ideas.length, 1);

const idea1 = parsed1.ideas[0];
assert.ok(idea1.english.text.includes('By 2035'), 'English text should match');
assert.ok(idea1.english.hashtags.includes('#AI'), 'English hashtags extracted');
assert.ok(idea1.romanUrdu.text.includes('2035 tak'), 'Roman Urdu text should match');
assert.ok(idea1.romanUrdu.hashtags.includes('#Technology'), 'Roman Urdu hashtags extracted');
assert.ok(idea1.plainUrdu.text.includes('۲۰۳۵ تک'), 'Plain Urdu script should match');
assert.ok(idea1.plainUrdu.hashtags.includes('#اردو') || idea1.plainUrdu.hashtags.includes('#مستقبل'), 'Urdu hashtags extracted');
console.log('✓ TEST 4 PASSED: Parsed 1 post idea into 3 distinct languages with hashtags.\n');

// TEST 5: Scaling to 5 Posts (15 Language Versions)
console.log('TEST 5: Testing 5 Post Ideas (15 Language Versions)...');
const raw5 = generateSimulatedOutputForN(5);
const parsed5 = parseGrokResponse(raw5, 5);
assert.strictEqual(parsed5.success, true);
assert.strictEqual(parsed5.ideas.length, 5, 'Should have 5 post ideas');

parsed5.ideas.forEach((idea, index) => {
  const num = index + 1;
  assert.strictEqual(idea.postNumber, num);
  assert.ok(idea.english.text.length > 0, `Idea ${num} English should not be empty`);
  assert.ok(idea.romanUrdu.text.length > 0, `Idea ${num} Roman Urdu should not be empty`);
  assert.ok(idea.plainUrdu.text.length > 0, `Idea ${num} Plain Urdu should not be empty`);
});
console.log('✓ TEST 5 PASSED: 5 post ideas parsed with 15 language versions.\n');

// TEST 6: Scaling to 10 Posts (30 Language Versions)
console.log('TEST 6: Testing 10 Post Ideas (30 Language Versions)...');
const raw10 = generateSimulatedOutputForN(10);
const parsed10 = parseGrokResponse(raw10, 10);
assert.strictEqual(parsed10.success, true);
assert.strictEqual(parsed10.ideas.length, 10, 'Should have 10 post ideas');

let totalLanguageVersions = 0;
parsed10.ideas.forEach((idea) => {
  if (idea.english.text) totalLanguageVersions++;
  if (idea.romanUrdu.text) totalLanguageVersions++;
  if (idea.plainUrdu.text) totalLanguageVersions++;
});
assert.strictEqual(totalLanguageVersions, 30, 'Should have exactly 30 language versions');
console.log('✓ TEST 6 PASSED: 10 post ideas parsed with 30 total language versions.\n');

// TEST 7: Single Language Regeneration & In-Memory State Update
console.log('TEST 7: Testing Single Language Regeneration and Memory State Update...');
const generator = new ContentGenerator();
generator.setSession({
  topic: SPEC_TEST_TOPIC,
  numberOfPosts: 1,
  ideas: parsed1.ideas
});

const regenPrompt = generator.createSingleLanguageRegenPrompt('English', 1, 'Make it shorter');
assert.ok(regenPrompt.includes('Make it shorter'), 'Feedback included in regen prompt');
assert.ok(regenPrompt.includes('ENGLISH'), 'Target language included');

const simulatedRegenResponse = `
ENGLISH:
Post text: In 2035, power shifts from one nation to many. Future strength will rely on five pillars: AI, data, minerals, food, and digital finance.
Hashtags: #Power2035 #AI
`;

const regenResult = generator.processSingleLanguageRegen(simulatedRegenResponse, 1, 'English');
assert.strictEqual(regenResult.success, true);

const updatedSession = generator.getSession();
assert.ok(updatedSession.ideas[0].english.text.includes('In 2035, power shifts'));
assert.ok(updatedSession.ideas[0].romanUrdu.text.includes('2035 tak'), 'Roman Urdu must remain untouched');
assert.ok(updatedSession.ideas[0].plainUrdu.text.includes('۲۰۳۵ تک'), 'Plain Urdu must remain untouched');
console.log('✓ TEST 7 PASSED: Single language regeneration updates memory without touching others.\n');

// TEST 8: Approval Simulation State
console.log('TEST 8: Testing Approval & Rejection Simulation...');
generator.setApproval(1, 'english', 'APPROVED');
assert.strictEqual(generator.getSession().ideas[0].approvedVersion, 'english');

generator.setApproval(1, 'romanUrdu', 'REJECTED');
assert.strictEqual(generator.getSession().ideas[0].romanUrduRejected, true);
assert.strictEqual(generator.getSession().ideas[0].approvedVersion, 'english', 'English approval retained');
console.log('✓ TEST 8 PASSED: Approval and rejection workflow operating cleanly in-memory.\n');

console.log('====================================================');
console.log('    ALL 8 TESTS PASSED SUCCESSFULLY! (100%)');
console.log('====================================================\n');
