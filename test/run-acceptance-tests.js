/**
 * Comprehensive Acceptance Test Suite for X_BOT Simple English System
 * Tests all 5 requirements specified in the TASK prompt.
 */

import assert from 'assert';
import { checkSimpleEnglish, SIMPLE_ENGLISH_RULES } from '../src/utils/simpleEnglish.js';
import { config } from '../src/config.js';
import { historyStore } from '../src/db/historyStore.js';
import {
  FALLBACK_BANK,
  CURATED_STORY_TOPICS,
  generateEnglishPost,
  generateRomanUrduFromEnglish,
  generatePlainUrduFromEnglish
} from '../src/generator/aiService.js';
import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('       X-BOT SIMPLE ENGLISH SYSTEM — ACCEPTANCE TESTS');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Check checkSimpleEnglish on every FALLBACK_BANK entry (and alias CURATED_STORY_TOPICS)
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('TEST 1: Validating all FALLBACK_BANK entries for Simple English & Length');
console.log('----------------------------------------------------------------');

assert.strictEqual(CURATED_STORY_TOPICS, FALLBACK_BANK, 'CURATED_STORY_TOPICS must equal FALLBACK_BANK');
console.log(`Found ${FALLBACK_BANK.length} entries in FALLBACK_BANK.`);

let test1Errors = [];
FALLBACK_BANK.forEach((entry, idx) => {
  const err = checkSimpleEnglish(entry.english.text);
  const len = entry.english.text.length;

  if (err) {
    test1Errors.push(`Entry #${idx + 1} (${entry.topic}): ${err}`);
  } else if (len < 400 || len > 600) {
    test1Errors.push(`Entry #${idx + 1} (${entry.topic}): Length ${len} is outside 400-600`);
  } else {
    console.log(`  ✓ [#${String(idx + 1).padStart(2, '0')}] ${len} chars | Pass | "${entry.topic}"`);
  }
});

assert.strictEqual(test1Errors.length, 0, `Test 1 failed with errors:\n${test1Errors.join('\n')}`);
console.log(`\n✓ TEST 1 PASSED: All ${FALLBACK_BANK.length} entries pass checkSimpleEnglish and have valid 400-600 length.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Run generateEnglishPost() 10 times and verify simple English and zero hashtags
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('TEST 2: Running generateEnglishPost() 10 times');
console.log('----------------------------------------------------------------');

async function runTest2() {
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGrok = process.env.GROK_API_KEY;
  const originalXai = process.env.XAI_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;
  const originalCfToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalCfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const originalConfigCfToken = config.cloudflareApiToken;
  const originalConfigCfAccount = config.cloudflareAccountId;
  const savedHistory = [...historyStore.posts];
  historyStore.reset();

  // Temporarily unset keys to test fallback generation cleanly without network variance
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  config.cloudflareApiToken = '';
  config.cloudflareAccountId = '';

  try {
    for (let i = 1; i <= 10; i++) {
      const post = await generateEnglishPost();
      const text = post.english.text;
      const simpleErr = checkSimpleEnglish(text);
      const hashtagMatch = text.match(/#[\p{L}\p{N}_]+/gu);

      assert.strictEqual(simpleErr, null, `Run #${i} failed checkSimpleEnglish: ${simpleErr}`);
      assert.strictEqual(hashtagMatch, null, `Run #${i} contains hashtags: ${hashtagMatch}`);
      assert.ok(text.length >= 400 && text.length <= 600, `Run #${i} length ${text.length} outside 400-600`);

      console.log(`  ✓ Run #${i}: [${post.provider}] "${post.topic}" (${text.length} chars)`);
    }
  } finally {
    if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
    if (originalGrok) process.env.GROK_API_KEY = originalGrok;
    if (originalXai) process.env.XAI_API_KEY = originalXai;
    if (originalGroq) process.env.GROQ_API_KEY = originalGroq;
    if (originalCfToken) process.env.CLOUDFLARE_API_TOKEN = originalCfToken;
    if (originalCfAccount) process.env.CLOUDFLARE_ACCOUNT_ID = originalCfAccount;
    config.cloudflareApiToken = originalConfigCfToken;
    config.cloudflareAccountId = originalConfigCfAccount;
    historyStore.posts = savedHistory;
    historyStore.rebuildIndexes();
    historyStore.save();
  }
}

await runTest2();
console.log('\n✓ TEST 2 PASSED: 10/10 generated posts passed checkSimpleEnglish with 0 hashtags and 400-600 chars.\n');

// -----------------------------------------------------------------------------
// TEST 3: Confirm rejection criteria is removed (no blocking rejections)
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('TEST 3: Confirming rejection criteria is removed (no blocking rejections)');
console.log('----------------------------------------------------------------');

const sampleSentence = "The sovereign fiscal allocation exacerbates structural inefficiencies.";
const rejectionReason = checkSimpleEnglish(sampleSentence);
console.log(`Sample sentence tested: "${sampleSentence}"`);
console.log(`Check result: ${rejectionReason}`);
assert.strictEqual(rejectionReason, null, 'Rejection criteria must be removed; checkSimpleEnglish must return null');
console.log('  ✓ No rejection triggered: checkSimpleEnglish returns null without blocking errors');

console.log('\n✓ TEST 3 PASSED: Rejection criteria successfully removed per user request.\n');

// -----------------------------------------------------------------------------
// TEST 4: Confirm no Math.random() statistics generator remains
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('TEST 4: Confirming no Math.random() statistics generator remains');
console.log('----------------------------------------------------------------');

const aiServicePath = path.resolve('src/generator/aiService.js');
const aiServiceContent = fs.readFileSync(aiServicePath, 'utf8');

const mathRandomMatchesInAiService = [...aiServiceContent.matchAll(/Math\.random/g)];
console.log(`Occurrences of Math.random in src/generator/aiService.js: ${mathRandomMatchesInAiService.length}`);
assert.strictEqual(mathRandomMatchesInAiService.length, 0, 'No Math.random() allowed in aiService.js');

// Also check that fake stat generation patterns like $statA or percentC are gone
assert.ok(!aiServiceContent.includes('statA'), 'No statA template variables allowed');
assert.ok(!aiServiceContent.includes('statB'), 'No statB template variables allowed');
assert.ok(!aiServiceContent.includes('percentC'), 'No percentC template variables allowed');
console.log('  ✓ No fake statistics generation or templates exist in aiService.js');

console.log('\n✓ TEST 4 PASSED: Confirmed zero Math.random() statistics remain.\n');

// -----------------------------------------------------------------------------
// TEST 5: Confirm Roman Urdu and Urdu functions throw clear error when providers fail
// -----------------------------------------------------------------------------
console.log('----------------------------------------------------------------');
console.log('TEST 5: Confirming Roman Urdu & Plain Urdu throw on unmatchable topics');
console.log('----------------------------------------------------------------');

// Test with a mock post that does not exist in FALLBACK_BANK and with AI providers offline
const nonExistentPost = {
  text: "This is a completely unknown custom post about an unlisted topic that has no translation."
};
const nonExistentTopic = "Completely Unknown Topic That Does Not Exist 99999";

const originalGemini = process.env.GEMINI_API_KEY;
const originalGrok = process.env.GROK_API_KEY;
const originalXai = process.env.XAI_API_KEY;
const originalGroq = process.env.GROQ_API_KEY;
const originalCfToken = process.env.CLOUDFLARE_API_TOKEN;
const originalCfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
const originalConfigCfToken = config.cloudflareApiToken;
const originalConfigCfAccount = config.cloudflareAccountId;

delete process.env.GEMINI_API_KEY;
delete process.env.GROK_API_KEY;
delete process.env.XAI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.CLOUDFLARE_API_TOKEN;
delete process.env.CLOUDFLARE_ACCOUNT_ID;
config.cloudflareApiToken = '';
config.cloudflareAccountId = '';

let romanThrew = false;
let romanErrorMessage = '';
try {
  await generateRomanUrduFromEnglish(nonExistentPost, nonExistentTopic);
} catch (e) {
  romanThrew = true;
  romanErrorMessage = e.message;
}

let urduThrew = false;
let urduErrorMessage = '';
try {
  await generatePlainUrduFromEnglish(nonExistentPost, nonExistentTopic);
} catch (e) {
  urduThrew = true;
  urduErrorMessage = e.message;
}

// Restore keys
if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
if (originalGrok) process.env.GROK_API_KEY = originalGrok;
if (originalXai) process.env.XAI_API_KEY = originalXai;
if (originalGroq) process.env.GROQ_API_KEY = originalGroq;
if (originalCfToken) process.env.CLOUDFLARE_API_TOKEN = originalCfToken;
if (originalCfAccount) process.env.CLOUDFLARE_ACCOUNT_ID = originalCfAccount;
config.cloudflareApiToken = originalConfigCfToken;
config.cloudflareAccountId = originalConfigCfAccount;

assert.strictEqual(romanThrew, true, 'Roman Urdu must throw an error when all providers fail and topic is not in bank');
assert.ok(romanErrorMessage.includes('all AI providers failed and no matching bank entry found'), `Unexpected Roman Urdu error: ${romanErrorMessage}`);
console.log(`  ✓ Roman Urdu threw expected error: "${romanErrorMessage}"`);

assert.strictEqual(urduThrew, true, 'Plain Urdu must throw an error when all providers fail and topic is not in bank');
assert.ok(urduErrorMessage.includes('all AI providers failed and no matching bank entry found'), `Unexpected Plain Urdu error: ${urduErrorMessage}`);
console.log(`  ✓ Plain Urdu threw expected error: "${urduErrorMessage}"`);

console.log('\n✓ TEST 5 PASSED: Clear errors thrown instead of falling back to wrong-topic translation.\n');

console.log('================================================================');
console.log('         ALL 5 ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!');
console.log('================================================================\n');
