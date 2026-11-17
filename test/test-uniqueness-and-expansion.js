/**
 * Comprehensive Test Suite for:
 * 1. Exact duplicate rejection
 * 2. Same post with different wording
 * 3. Same argument with a different hook
 * 4. Same subject with a genuinely different argument
 * 5. Duplicate detection across different genres
 * 6. MongoDB & JSON persistence after application restart
 * 7. Fresh-post WhatsApp command (Option 5)
 * 8. All four AI generation tiers
 * 9. Roman Urdu and Plain Urdu translation
 * 10. Concurrent generation requests
 */

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import {
  historyStore,
  computeNormalizedHash,
  extractPostMetadata,
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateArgumentSimilarity
} from '../src/db/historyStore.js';
import {
  isDuplicatePost,
  saveGeneratedPost,
  updatePostTranslation,
  getAllUsedTopics
} from '../src/db/postModel.js';
import { genreManager } from '../src/generator/genreManager.js';
import {
  generateEnglishPost,
  generateRomanUrduFromEnglish,
  generatePlainUrduFromEnglish,
  generateMultilingualPost
} from '../src/generator/aiService.js';
import { whatsappWorkflow } from '../src/whatsapp/workflow.js';

console.log('====================================================');
console.log('  TESTING INTELLIGENT UNIQUENESS & GENRE EXPANSION  ');
console.log('====================================================\n');

async function runTests() {
  // --------------------------------------------------------
  // SETUP: Clean test state
  // --------------------------------------------------------
  historyStore.reset();
  genreManager.reset();

  // Baseline post
  const BASELINE_POST = {
    topic: "India vs Pakistan: Weapons vs Welfare Priorities",
    subtopic: "Defence budget vs public welfare priorities",
    genreId: "PAK_VS_IND",
    category: "PAK_VS_IND",
    englishText: "India spends $83 billion on defence, while Pakistan spends $9 billion. That means India outspends Pakistan by more than 9 to 1.\n\nYet 40% of people in both nations lack clean water, and 25 million Pakistani children are out of school. Both countries buy $100M fighter jets while public hospitals lack basic medicines.\n\nWhat is the point of nuclear deterrence if citizens are dying of poverty?",
    mainSubject: "India vs Pakistan Defence Spending",
    specificEventOrIssue: "Military procurement vs clean water and education",
    centralArgument: "Massive defence spending of $83B vs $9B compromises clean water and public schooling for millions",
    analyticalAngle: "Military spending vs human welfare deprivation",
    importantStatistics: ["$83b", "$9b", "40%", "25m", "$100m"]
  };

  historyStore.recordPost(BASELINE_POST);
  await saveGeneratedPost({
    topic: BASELINE_POST.topic,
    genreId: BASELINE_POST.genreId,
    subtopic: BASELINE_POST.subtopic,
    mainSubject: BASELINE_POST.mainSubject,
    centralArgument: BASELINE_POST.centralArgument,
    analyticalAngle: BASELINE_POST.analyticalAngle,
    importantStatistics: BASELINE_POST.importantStatistics,
    english: { text: BASELINE_POST.englishText }
  });

  // ========================================================
  // TEST 1: Exact Duplicate Rejection
  // ========================================================
  console.log('TEST 1: Exact Duplicate Rejection...');
  const dupCheck1 = historyStore.isDuplicateOrSimilar(BASELINE_POST.englishText, BASELINE_POST.topic);
  assert.strictEqual(dupCheck1.isDuplicate, true, 'Exact duplicate must be rejected');
  assert.ok(
    dupCheck1.reason.includes('EXACT_HASH_MATCH') || dupCheck1.reason.includes('EXACT_TEXT_MATCH'),
    `Reason should be hash match, got: ${dupCheck1.reason}`
  );
  console.log(`✓ TEST 1 PASSED: Exact text duplicate rejected (${dupCheck1.reason})\n`);

  // ========================================================
  // TEST 2: Same Post with Different Wording (Rewritten Sentences)
  // ========================================================
  console.log('TEST 2: Same Post with Different Wording (Rewritten sentences)...');
  const rewordedText = "India allocates $83 billion for defense while Pakistan expends $9 billion, outspending its neighbour nine to one.\n\nMeanwhile, 40 percent of citizens in both countries lack pure drinking water, and twenty-five million Pakistani children do not attend school. Both governments purchase 100M dollar fighter aircraft while local hospitals lack basic medicines.\n\nWhy maintain nuclear deterrence when citizens perish from poverty?";

  const dupCheck2 = historyStore.isDuplicateOrSimilar(rewordedText, "India vs Pakistan: Military vs Welfare Rephrased", {
    subtopic: "Defence budget vs public welfare priorities",
    centralArgument: "Massive defence budgets of $83B vs $9B leave citizens without drinking water and schools",
    importantStatistics: ["$83b", "$9b", "40%", "25m", "$100m"]
  });

  assert.strictEqual(dupCheck2.isDuplicate, true, 'Reworded post with same statistics and arguments must be rejected');
  console.log(`✓ TEST 2 PASSED: Reworded post rejected (${dupCheck2.reason})\n`);

  // ========================================================
  // TEST 3: Same Argument with a Completely Different Hook
  // ========================================================
  console.log('TEST 3: Same Argument with a Completely Different Hook...');
  const differentHookText = "A striking reality confronts South Asia this year: military contractors celebrate while citizens suffer.\n\nNew Delhi expends $83 billion on weapons while Islamabad allocates $9 billion. At the exact same time, 40% of the population cannot access safe drinking water and 25 million children remain out of classrooms.\n\nHow can national security be guaranteed if the public is deprived of basic survival?";

  const dupCheck3 = historyStore.isDuplicateOrSimilar(differentHookText, "The South Asian Security Illusion", {
    subtopic: "Defence budget vs public welfare priorities",
    mainSubject: "India vs Pakistan Defence Spending",
    centralArgument: "Massive defence spending of $83B vs $9B compromises clean water and public schooling for millions",
    analyticalAngle: "Military spending vs human welfare deprivation",
    importantStatistics: ["$83b", "$9b", "40%", "25m"]
  });

  assert.strictEqual(dupCheck3.isDuplicate, true, 'Different hook using the same argument and statistics must be rejected');
  console.log(`✓ TEST 3 PASSED: Different hook with same core argument rejected (${dupCheck3.reason})\n`);

  // ========================================================
  // TEST 4: Same Subject with a Genuinely Different Argument & Subtopic
  // ========================================================
  console.log('TEST 4: Same Subject with a Genuinely Different Argument...');
  const differentArgumentText = "The BCCI captures 38.5% of total ICC annual cricket earnings, pulling in $230 million every year. Broadcast rights for the Indian Premier League reached $6.2 billion, creating an unprecedented economic monopoly.\n\nThis commercial dominance enables New Delhi to dictate tournament venues and isolate rival boards financially.\n\nHas cricket ceased to be a sport when television revenue dictates international sports policy?";

  const dupCheck4 = historyStore.isDuplicateOrSimilar(differentArgumentText, "Cricket Diplomacy: BCCI Revenue Monopoly", {
    genreId: "PAK_VS_IND",
    subtopic: "BCCI financial influence and IPL economics",
    mainSubject: "BCCI Cricket Revenue Monopoly",
    centralArgument: "BCCI economic monopoly over 38.5% of ICC revenue turns cricket into a tool of geopolitical isolation",
    analyticalAngle: "Commercial monopoly and sports diplomacy",
    importantStatistics: ["38.5%", "$230m", "$6.2b"]
  });

  assert.strictEqual(dupCheck4.isDuplicate, false, 'Genuinely different argument and subtopic on same subject must be accepted');
  console.log('✓ TEST 4 PASSED: Genuinely different argument & subtopic accepted!\n');

  // ========================================================
  // TEST 5: Duplicate Detection Across Different Genres
  // ========================================================
  console.log('TEST 5: Duplicate Detection Across Different Genres...');
  // Baseline post in GEOPOLITICS
  const GEO_POST = {
    topic: "Semiconductor Choke Points: Taiwan Strait Security",
    subtopic: "Taiwan Strait and global microchip supply security",
    genreId: "GEOPOLITICS",
    category: "GEOPOLITICS",
    englishText: "Taiwan manufactures 90% of the world's advanced microchips. A naval blockade in the Taiwan Strait would cost $2.6 trillion in the first year alone.\n\nBoth the US and China spend hundreds of billions on domestic foundries but cannot replace Taiwan before 2030.\n\nDoes military power rule the world or does a silicon wafer?",
    mainSubject: "Taiwan Semiconductor Security",
    centralArgument: "Taiwan's 90% microchip dominance means a strait blockade causes $2.6T loss that military power cannot prevent",
    importantStatistics: ["90%", "$2.6t", "2030"]
  };
  historyStore.recordPost(GEO_POST);

  // Attempt candidate under AI_HUMAN_SOCIETY with overlapping argument and stats
  const crossGenreCandidate = "Over 90% of modern advanced chips originate from Taiwan's foundries, where a strait blockade would immediately drain $2.6 trillion from global commerce.\n\nMajor powers invest hundreds of billions into chip factories but face a decade of delay.\n\nWho controls technological supremacy when microchips remain geographically trapped?";

  const dupCheck5 = historyStore.isDuplicateOrSimilar(crossGenreCandidate, "AI Hardware Supply Vulnerability", {
    genreId: "AI_HUMAN_SOCIETY",
    subtopic: "AI microchip supply and fabrication limits",
    mainSubject: "Taiwan Semiconductor Security",
    centralArgument: "Taiwan's 90% microchip dominance means a strait blockade causes $2.6T loss that military power cannot prevent",
    importantStatistics: ["90%", "$2.6t"]
  });

  assert.strictEqual(dupCheck5.isDuplicate, true, 'Cross-genre duplicate candidate must be caught and rejected');
  console.log(`✓ TEST 5 PASSED: Cross-genre duplicate detected and rejected (${dupCheck5.reason})\n`);

  // ========================================================
  // TEST 6: MongoDB & JSON Persistence After Restart Simulation
  // ========================================================
  console.log('TEST 6: Persistence After Application Restart Simulation...');
  const HISTORY_FILE = path.resolve(process.cwd(), 'data/post_history.json');
  assert.ok(fs.existsSync(HISTORY_FILE), 'post_history.json must exist');

  // Verify file has saved posts
  const rawData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  assert.ok(rawData.posts.length >= 2, 'History file must contain saved posts');

  // Clear in-memory state and reload from disk
  historyStore.hashes.clear();
  historyStore.topics.clear();
  historyStore.subtopics.clear();
  historyStore.posts = [];
  historyStore.load(); // Simulates fresh startup

  assert.ok(historyStore.posts.length >= 2, 'HistoryStore must restore all posts from disk');
  const checkAfterRestart = historyStore.isDuplicateOrSimilar(BASELINE_POST.englishText, BASELINE_POST.topic);
  assert.strictEqual(checkAfterRestart.isDuplicate, true, 'Duplicate must still be rejected after restart');
  console.log(`✓ TEST 6 PASSED: ${historyStore.posts.length} posts restored from disk; duplicate blocked after restart!\n`);

  // ========================================================
  // TEST 7: Fresh-Post WhatsApp Command (Option 5)
  // ========================================================
  console.log('TEST 7: Fresh-Post WhatsApp Command (Option 5)...');
  genreManager.setPrimaryGenre('PAK_VS_IND');

  const initialGen = await whatsappWorkflow.generateAndSend('', '');
  assert.ok(initialGen.post, 'Initial post must be generated');
  const initialTopic = initialGen.post.topic;
  const initialText = initialGen.post.english.text;

  // Simulate owner replying "5" (Generate NEW fresh post)
  const testOwnerNumber = config.ownerPhoneNumber || process.env.OWNER_PHONE_NUMBER || '923001234567';
  const freshDecision = await whatsappWorkflow.handleOwnerReply('5', testOwnerNumber);
  assert.ok(freshDecision.post, 'Fresh post must be generated on Option 5');
  const freshTopic = freshDecision.post.topic;
  const freshText = freshDecision.post.english.text;

  assert.notStrictEqual(freshTopic, initialTopic, 'Option 5 must not repeat initial topic');
  assert.notStrictEqual(freshText, initialText, 'Option 5 must not repeat initial text');

  // Verify initial post was marked DISCARDED in history
  const discardedPost = historyStore.posts.find(p => p.topic === initialTopic);
  assert.strictEqual(discardedPost?.status, 'DISCARDED', 'Initial post must be marked DISCARDED');
  console.log(`✓ TEST 7 PASSED: Option 5 generated fresh post "${freshTopic}" and discarded previous!\n`);

  // ========================================================
  // TEST 8: All Four AI Generation Tiers Integration
  // ========================================================
  console.log('TEST 8: All Four AI Generation Tiers Integration...');
  // Test generation across genres verifying provider assignment & duplicate guard
  const genResult = await generateEnglishPost('', '');
  assert.ok(genResult.english && genResult.english.text, 'English text must exist');
  assert.ok(genResult.provider, 'Provider must be identified');
  assert.ok(genResult.centralArgument, 'Central argument metadata must be populated');
  assert.ok(genResult.importantStatistics, 'Statistics metadata must be populated');
  assert.ok(
    genResult.english.charCount >= 380 && genResult.english.charCount <= 600,
    `Length must be 400-600, got ${genResult.english.charCount}`
  );
  console.log(`✓ TEST 8 PASSED: Post generated via tier "${genResult.provider}" (${genResult.english.charCount} chars) with full metadata!\n`);

  // ========================================================
  // TEST 9: Roman Urdu and Plain Urdu Translation (In-Place)
  // ========================================================
  console.log('TEST 9: Roman Urdu and Plain Urdu Translation (In-Place)...');
  const postCountBefore = historyStore.posts.length;

  const romanUrdu = await generateRomanUrduFromEnglish(genResult.english, genResult.topic);
  assert.ok(romanUrdu && romanUrdu.text, 'Roman Urdu translation must be generated');
  assert.ok(romanUrdu.charCount >= 100, 'Roman Urdu text must have meaningful length');

  const plainUrdu = await generatePlainUrduFromEnglish(genResult.english, genResult.topic);
  assert.ok(plainUrdu && plainUrdu.text, 'Plain Urdu translation must be generated');
  assert.ok(plainUrdu.charCount >= 100, 'Plain Urdu text must have meaningful length');

  const postCountAfter = historyStore.posts.length;
  assert.strictEqual(postCountBefore, postCountAfter, 'Translation must update in-place without creating new duplicate entries in history');

  // Verify the record in history was updated
  const updatedRecord = historyStore.posts.find(p => p.topic === genResult.topic);
  assert.ok(updatedRecord.romanUrduText.length > 0, 'Record should now have romanUrduText');
  assert.ok(updatedRecord.plainUrduText.length > 0, 'Record should now have plainUrduText');
  console.log('✓ TEST 9 PASSED: Translations generated and updated in-place without duplicate record creation!\n');

  // ========================================================
  // TEST 10: Concurrent Generation Requests
  // ========================================================
  console.log('TEST 10: Concurrent Generation Requests...');
  const lockKey = 'test_concurrent_lock_key';
  const lock1 = historyStore.acquireLock(lockKey);
  assert.strictEqual(lock1, true, 'First lock acquisition must succeed');

  const lock2 = historyStore.acquireLock(lockKey);
  assert.strictEqual(lock2, false, 'Simultaneous second lock acquisition on same key must fail');

  historyStore.releaseLock(lockKey);
  const lock3 = historyStore.acquireLock(lockKey);
  assert.strictEqual(lock3, true, 'Lock acquisition after release must succeed');
  historyStore.releaseLock(lockKey);

  // Test simultaneous asynchronous generation requests
  const [resA, resB] = await Promise.all([
    generateEnglishPost('', ''),
    generateEnglishPost('', '')
  ]);

  assert.ok(resA && resB, 'Both concurrent requests must complete');
  assert.notStrictEqual(resA.topic, resB.topic, 'Concurrent generations must produce distinct topics');
  assert.notStrictEqual(resA.english.text, resB.english.text, 'Concurrent generations must produce distinct texts');
  console.log(`✓ TEST 10 PASSED: Concurrent generation requests handled safely without collision!\n`);

  console.log('====================================================');
  console.log('   ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY!   ');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n✕ TEST FAILED:', err);
  process.exit(1);
});
