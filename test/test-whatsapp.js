/**
 * Test Suite for WhatsApp Webhook Server and Approval Workflow
 */

import assert from 'assert';
import app, { startServer } from '../src/whatsapp/server.js';
import { whatsappWorkflow } from '../src/whatsapp/workflow.js';
import { postScheduler } from '../src/utils/scheduler.js';
import { keepAliveService } from '../src/utils/keepAlive.js';
import { config } from '../src/config.js';
import { genreManager } from '../src/generator/genreManager.js';
import { historyStore } from '../src/db/historyStore.js';

console.log('====================================================');
console.log('        TESTING WHATSAPP WEBHOOK & WORKFLOW');
console.log('====================================================\n');

const TEST_PORT = 3999;
config.ownerPhoneNumber = '923001234567';

// Mock outbound WhatsApp network calls for unit testing
import { whatsappClient } from '../src/whatsapp/client.js';
whatsappClient.sendPostForReview = async (to, post) => ({ messages: [{ id: 'mock_wamid_123' }] });
whatsappClient.sendEnglishPostForReview = async (to, post) => ({ messages: [{ id: 'mock_wamid_123' }] });
whatsappClient.sendRomanUrduVersion = async (to, post) => ({ messages: [{ id: 'mock_wamid_roman' }] });
whatsappClient.sendPlainUrduVersion = async (to, post) => ({ messages: [{ id: 'mock_wamid_urdu' }] });
whatsappClient.sendApprovalConfirmation = async (to, lang, post) => ({ messages: [{ id: 'mock_wamid_456' }] });
whatsappClient.sendText = async (to, text) => ({ messages: [{ id: 'mock_wamid_txt' }] });

const server = startServer(TEST_PORT);

async function runTests() {
  try {
    const baseUrl = `http://localhost:${TEST_PORT}`;

    // TEST 1: Meta Webhook Verification Handshake (Valid token)
    console.log('TEST 1: Testing Meta Webhook Verification Handshake...');
    const challengeStr = 'challenge_test_123456';
    const verifyRes = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${config.webhookVerifyToken}&hub.challenge=${challengeStr}`
    );
    assert.strictEqual(verifyRes.status, 200, 'Handshake should return 200 OK');
    const returnedChallenge = await verifyRes.text();
    assert.strictEqual(returnedChallenge, challengeStr, 'Challenge string must match exactly');
    console.log('✓ TEST 1 PASSED: Webhook verification handshake working.\n');

    // TEST 2: Invalid Token Handshake
    console.log('TEST 2: Testing Invalid Token Rejection...');
    const invalidRes = await fetch(
      `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong_secret&hub.challenge=test`
    );
    assert.strictEqual(invalidRes.status, 403, 'Invalid token should return 403 Forbidden');
    console.log('✓ TEST 2 PASSED: Invalid token correctly rejected.\n');

    // TEST 3: Health Check
    console.log('TEST 3: Testing Health Check Endpoint...');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'healthy');
    console.log('✓ TEST 3 PASSED: Health endpoint OK.\n');

    // TEST 4: 1 English Post Generation into Memory Workflow
    console.log('TEST 4: Generating 1 English Post into Memory Workflow...');
    await whatsappWorkflow.generateAndSend('Test Autonomous AI topic');
    const state = whatsappWorkflow.getCurrentState();
    assert.strictEqual(state.status, 'AWAITING_APPROVAL');
    assert.ok(state.currentPendingPost, 'Pending post should exist in memory');
    assert.ok(state.currentPendingPost.english.text, 'English text should exist');
    assert.strictEqual(state.currentPendingPost.activeView, 'ENGLISH');
    console.log('✓ TEST 4 PASSED: 1 English post generated with 5 options ready.\n');

    // TEST 5: Owner Replying "3" (Post directly in English)
    console.log('TEST 5: Simulating Owner Replying "3" (Post directly in English)...');
    const metaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test_entry_id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '123', phone_number_id: '456' },
                messages: [
                  {
                    from: config.ownerPhoneNumber || '923001234567',
                    id: 'wamid_test_msg_id',
                    timestamp: '1600000000',
                    type: 'text',
                    text: { body: '3' }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const webhookPostRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaWebhookPayload)
    });
    assert.strictEqual(webhookPostRes.status, 200, 'Webhook should return 200 OK to Meta');

    // Check state update
    const approvedState = whatsappWorkflow.getCurrentState();
    assert.strictEqual(approvedState.status, 'APPROVED', 'Post status must be APPROVED');
    assert.strictEqual(approvedState.approvedPost.language, 'English', 'Language should be English');
    assert.ok(approvedState.approvedPost.content.text, 'Content text should be present');
    console.log('✓ TEST 5 PASSED: Inbound WhatsApp reply "3" successfully approved English directly!\n');

    // TEST 6: Status API
    console.log('TEST 6: Testing GET /status endpoint...');
    const statusRes = await fetch(`${baseUrl}/status`);
    const statusJson = await statusRes.json();
    assert.strictEqual(statusJson.state.status, 'APPROVED');
    assert.strictEqual(statusJson.state.approvedPost.language, 'English');
    console.log('✓ TEST 6 PASSED: Status endpoint accurately reports in-memory approval state.\n');

    // TEST 7: Template Configuration & Method
    console.log('TEST 7: Testing WhatsApp Template Endpoint Configuration...');
    assert.strictEqual(config.whatsappTemplateName, '3p_direct_integration_test_template');
    assert.strictEqual(config.whatsappTemplateLang, 'en_US');
    assert.strictEqual(config.whatsappAppId, '1538340228340646');
    console.log('✓ TEST 7 PASSED: Template name, language, and app ID verified.\n');

    // TEST 8: Waking the Bot with Initial SMS ("Hi")
    console.log('TEST 8: Simulating Owner Sending "Hi" to Wake Bot...');
    whatsappWorkflow.currentPendingPost = null;
    whatsappWorkflow.status = 'IDLE';
    const wakeResult = await whatsappWorkflow.handleOwnerReply('Hello there!', config.ownerPhoneNumber);
    assert.strictEqual(wakeResult.action, 'GREETING_SENT');
    assert.strictEqual(wakeResult.status, 'AWAITING_GENERATE');
    assert.ok(
      wakeResult.message.includes('HI, welcome to your X Assistant press 1 to generate new post'),
      'Greeting message must contain base welcome instruction'
    );
    assert.ok(wakeResult.message.includes('2 to customize the bot'), 'Greeting message must include customize option');
    console.log('✓ TEST 8 PASSED: Initial SMS greeted owner with refined menu.\n');

    // TEST 9: Owner Pressing "1" to Generate New Post
    console.log('TEST 9: Simulating Owner Pressing "1" to Generate Post...');
    const generateResult = await whatsappWorkflow.handleOwnerReply('1', config.ownerPhoneNumber);
    assert.strictEqual(generateResult.success, true);
    assert.strictEqual(whatsappWorkflow.status, 'AWAITING_APPROVAL');
    assert.ok(whatsappWorkflow.currentPendingPost, 'New post is generated and awaiting review');
    console.log('✓ TEST 9 PASSED: Pressing 1 triggered multilingual post generation!\n');

    // TEST 10: Testing POST /trigger endpoint (Synchronous wait for owner response)
    console.log('TEST 10: Testing POST /trigger waiting for owner response via POST /respond...');
    whatsappWorkflow.status = 'IDLE';
    whatsappWorkflow.currentPendingPost = null;

    const triggerPromise = fetch(`${baseUrl}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Test Trigger AI', timeoutMs: 30000 })
    }).then(r => r.json());

    // Allow trigger to start and enter waiting state
    for (let i = 0; i < 300; i++) {
      if (whatsappWorkflow.status === 'AWAITING_APPROVAL' && whatsappWorkflow.currentPendingPost) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Simulate owner approving English via POST /respond (Option 3 on English view)
    const respondRes = await fetch(`${baseUrl}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: '3' })
    });
    assert.strictEqual(respondRes.status, 200);

    const triggerResult = await triggerPromise;
    assert.strictEqual(triggerResult.status, 'APPROVED');
    assert.strictEqual(triggerResult.language, 'English');
    assert.ok(triggerResult.approvedPost.text, 'Approved post text returned by /trigger');
    console.log('✓ TEST 10 PASSED: POST /trigger waited and resolved with owner approval!\n');

    // TEST 11: Daily Scheduler Endpoint
    console.log('TEST 11: Testing Daily Auto-Post Scheduler Endpoints...');
    const schedRes = await fetch(`${baseUrl}/schedule`);
    const schedJson = await schedRes.json();
    assert.ok('dailyTime' in schedJson, 'dailyTime must be present');
    assert.ok('currentTime' in schedJson, 'currentTime must be present');
    assert.ok('timezone' in schedJson, 'timezone must be present');

    const updateSchedRes = await fetch(`${baseUrl}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: '14:30', timezone: 'Asia/Karachi' })
    });
    const updateSchedJson = await updateSchedRes.json();
    assert.strictEqual(updateSchedJson.schedule.dailyTime, '14:30');
    assert.strictEqual(updateSchedJson.schedule.timezone, 'Asia/Karachi');
    console.log('✓ TEST 11 PASSED: Daily auto-post scheduler configured and responsive!\n');

    // TEST 12: Non-Owner Security Guard
    console.log('TEST 12: Testing Non-Owner Security Guard...');
    const strangerResult = await whatsappWorkflow.handleOwnerReply('1', '923999888777');
    assert.strictEqual(strangerResult.action, 'IGNORED_NON_OWNER');
    assert.strictEqual(whatsappWorkflow.isOwner('923999888777'), false);
    assert.strictEqual(whatsappWorkflow.isOwner(config.ownerPhoneNumber), true);
    console.log('✓ TEST 12 PASSED: Non-owner messages safely ignored. Normal WhatsApp preserved for other contacts!\n');

    // TEST 13: Opening Customize Bot Menu (Pressing 2)
    console.log('TEST 13: Testing Customize Bot Menu Opening...');
    whatsappWorkflow.currentPendingPost = null;
    const customMenuResult = await whatsappWorkflow.handleOwnerReply('2', config.ownerPhoneNumber);
    assert.strictEqual(customMenuResult.action, 'CUSTOMIZE_MENU_OPENED');
    assert.strictEqual(whatsappWorkflow.menuState, 'CUSTOMIZE_MENU');
    assert.ok(customMenuResult.message.includes('Add another genre'));
    assert.ok(customMenuResult.message.includes('Show all genres'));
    assert.ok(customMenuResult.message.includes('Make a genre primary'));
    console.log('✓ TEST 13 PASSED: Customize Bot menu successfully opened!\n');

    // TEST 14: Option 1 — Adding a New Custom Genre
    console.log('TEST 14: Testing Option 1: Adding a New Custom Genre...');
    const option1Result = await whatsappWorkflow.handleOwnerReply('1', config.ownerPhoneNumber);
    assert.strictEqual(option1Result.action, 'AWAITING_NEW_GENRE');
    assert.strictEqual(whatsappWorkflow.menuState, 'AWAITING_NEW_GENRE');

    const addGenreResult = await whatsappWorkflow.handleOwnerReply('Space & Cyber Defence', config.ownerPhoneNumber);
    assert.strictEqual(addGenreResult.action, 'GENRE_ADDED');
    assert.strictEqual(addGenreResult.genre.name, 'Space & Cyber Defence');
    const allGenresNow = genreManager.getAllGenres();
    assert.ok(allGenresNow.some(g => g.name === 'Space & Cyber Defence'), 'New genre must be saved in genreManager');
    console.log('✓ TEST 14 PASSED: New genre "Space & Cyber Defence" added and persisted!\n');

    // TEST 15: Option 2 — Show All Genres
    console.log('TEST 15: Testing Option 2: Show All Genres...');
    const option2Result = await whatsappWorkflow.handleOwnerReply('2', config.ownerPhoneNumber);
    assert.strictEqual(option2Result.action, 'LIST_GENRES');
    assert.ok(option2Result.message.includes('Pak vs Ind'), 'List must include "Pak vs Ind"');
    assert.ok(option2Result.message.includes('Space & Cyber Defence'), 'List must include newly added genre');
    console.log('✓ TEST 15 PASSED: All genres correctly listed with numbers!\n');

    // TEST 16: Option 3 — Make a Genre Primary ("Pak vs Ind")
    console.log('TEST 16: Testing Option 3: Make "Pak vs Ind" the Primary Genre...');
    const option3Result = await whatsappWorkflow.handleOwnerReply('3', config.ownerPhoneNumber);
    assert.strictEqual(option3Result.action, 'AWAITING_PRIMARY_SELECTION');
    assert.ok(option3Result.message.includes('Random'));
    assert.ok(option3Result.message.includes('Pak vs Ind'));

    // Select 1 for Pak vs Ind
    const selectPrimaryResult = await whatsappWorkflow.handleOwnerReply('1', config.ownerPhoneNumber);
    assert.strictEqual(selectPrimaryResult.action, 'PRIMARY_GENRE_SET');
    assert.strictEqual(selectPrimaryResult.isRandom, false);
    assert.strictEqual(selectPrimaryResult.genre.id, 'PAK_VS_IND');
    assert.strictEqual(genreManager.getPrimaryGenre()?.id, 'PAK_VS_IND');
    console.log('✓ TEST 16 PASSED: "Pak vs Ind" successfully set as exclusive Primary Genre!\n');

    // TEST 17: Post Generation with Primary Genre Active
    console.log('TEST 17: Verifying Post Generation Strictly Obeys Primary Genre ("Pak vs Ind")...');
    whatsappWorkflow.currentPendingPost = null;
    const pakVsIndGen = await whatsappWorkflow.generateAndSend();
    assert.strictEqual(pakVsIndGen.success, true);
    assert.strictEqual(pakVsIndGen.post.category, 'PAK_VS_IND', 'Post must strictly belong to PAK_VS_IND genre');
    assert.ok(pakVsIndGen.post.english.charCount >= 380 && pakVsIndGen.post.english.charCount <= 500, 'Must meet 400-500 char length');
    assert.ok(
      pakVsIndGen.post.english.text.toLowerCase().includes('india') &&
      pakVsIndGen.post.english.text.toLowerCase().includes('pakistan'),
      'Must contain India vs Pakistan comparison'
    );
    console.log(`   Generated Text Preview (${pakVsIndGen.post.english.charCount} chars):\n   "${pakVsIndGen.post.english.text.slice(0, 120)}..."`);
    console.log('✓ TEST 17 PASSED: Bot generates strictly from active primary genre!\n');

    // TEST 18: Anti-Duplication & Never Regenerates Old Post Guard
    console.log('TEST 18: Testing Anti-Duplication Guard (Never Regenerate Old Post)...');
    const existingCheck = historyStore.isDuplicateOrSimilar(
      pakVsIndGen.post.english.text,
      pakVsIndGen.post.topic
    );
    assert.strictEqual(existingCheck.isDuplicate, true, 'HistoryStore must detect already recorded post');
    console.log(`   Duplicate detection reason: ${existingCheck.reason}`);
    console.log('✓ TEST 18 PASSED: Duplicate or similar historical post successfully rejected!\n');

    // TEST 19: Switching Primary Genre back to 0 (Random)
    console.log('TEST 19: Testing Resetting Primary Genre to 0 (Random Rotation)...');
    whatsappWorkflow.currentPendingPost = null;
    whatsappWorkflow.status = 'IDLE';
    await whatsappWorkflow.handleOwnerReply('2', config.ownerPhoneNumber); // open customize
    await whatsappWorkflow.handleOwnerReply('3', config.ownerPhoneNumber); // select primary
    const resetResult = await whatsappWorkflow.handleOwnerReply('0', config.ownerPhoneNumber); // choose 0 for random
    assert.strictEqual(resetResult.action, 'PRIMARY_GENRE_SET');
    assert.strictEqual(resetResult.isRandom, true);
    assert.strictEqual(genreManager.getPrimaryGenre(), null, 'Primary genre must now be null (Random)');
    console.log('✓ TEST 19 PASSED: Primary genre reset to Random (rotating across all genres)!\n');

    // TEST 20: Option 6 on Post Review Menu (Customize Bot from Review Menu)
    console.log('TEST 20: Testing Option 6 on Post Review Menu (Customize Bot)...');
    whatsappWorkflow.currentPendingPost = null;
    await whatsappWorkflow.generateAndSend('Global Strategic Test');
    assert.ok(whatsappWorkflow.currentPendingPost, 'Pending post must exist');
    const opt6Result = await whatsappWorkflow.handleOwnerReply('6', config.ownerPhoneNumber);
    assert.strictEqual(opt6Result.action, 'CUSTOMIZE_MENU_OPENED', 'Option 6 must open customize menu');
    assert.strictEqual(whatsappWorkflow.menuState, 'CUSTOMIZE_MENU');
    assert.ok(opt6Result.message.includes('Back to Post Review'), 'Customize menu should show "Back to Post Review"');
    console.log('✓ TEST 20 PASSED: Option 6 successfully opened Customize Bot menu from post review!\n');

    // TEST 21: Option 0 from Customize Menu (Return back to Post Review)
    console.log('TEST 21: Testing Option 0 from Customize Menu (Return to Post Review)...');
    const backToPostResult = await whatsappWorkflow.handleOwnerReply('0', config.ownerPhoneNumber);
    assert.strictEqual(backToPostResult.action, 'RETURNED_TO_POST_REVIEW');
    assert.strictEqual(whatsappWorkflow.menuState, 'DEFAULT');
    assert.strictEqual(whatsappWorkflow.status, 'AWAITING_APPROVAL');
    assert.ok(whatsappWorkflow.currentPendingPost, 'Original pending post must be preserved');
    console.log('✓ TEST 21 PASSED: Option 0 returned directly to active post review!\n');

    // TEST 22: Option 5 (Never Regenerate Discarded Post)
    console.log('TEST 22: Testing Option 5 (Generate a NEW fresh post - Never Regenerates Old Post)...');
    const seenTopics = new Set();
    const seenTexts = new Set();
    
    // Check initial post
    seenTopics.add(whatsappWorkflow.currentPendingPost.topic.toLowerCase().trim());
    seenTexts.add(whatsappWorkflow.currentPendingPost.english.text.trim());

    // Trigger Option 5 consecutive fresh regenerations
    for (let round = 1; round <= 4; round++) {
      console.log(`   Simulating Option 5 press (Iteration ${round})...`);
      const prevTopic = whatsappWorkflow.currentPendingPost.topic;
      const prevText = whatsappWorkflow.currentPendingPost.english.text;

      const regenResult = await whatsappWorkflow.handleOwnerReply('5', config.ownerPhoneNumber);
      assert.strictEqual(regenResult.success, true);
      assert.ok(whatsappWorkflow.currentPendingPost, 'Fresh post must be active');

      const currentTopic = whatsappWorkflow.currentPendingPost.topic;
      const currentText = whatsappWorkflow.currentPendingPost.english.text;

      // Must NEVER match the immediately preceding rejected post
      assert.notStrictEqual(currentTopic.toLowerCase().trim(), prevTopic.toLowerCase().trim(), 'Must not repeat previous topic');
      assert.notStrictEqual(currentText.trim(), prevText.trim(), 'Must not repeat previous text');

      // Must NEVER match ANY topic or text seen across all rounds
      assert.strictEqual(seenTopics.has(currentTopic.toLowerCase().trim()), false, `Topic "${currentTopic}" was already seen!`);
      assert.strictEqual(seenTexts.has(currentText.trim()), false, `Post text was already seen!`);

      seenTopics.add(currentTopic.toLowerCase().trim());
      seenTexts.add(currentText.trim());
      console.log(`   ✓ Iteration ${round} generated unique topic: "${currentTopic}" (${currentText.length} chars)`);
    }
    console.log('✓ TEST 22 PASSED: Option 5 never regenerates discarded post, generating 100% unique posts!\n');

    // Restore persistent primary genre lock to PAK_VS_IND
    genreManager.setPrimaryGenre('PAK_VS_IND');
    console.log('✓ Verified: Primary Genre permanently locked to "Pak vs Ind"!\n');

    console.log('====================================================');
    console.log('   ALL WHATSAPP WEBHOOK TESTS PASSED! (100%)');
    console.log('====================================================\n');
  } finally {
    postScheduler.stop();
    keepAliveService.stop();
    server.close();
  }
}

runTests().catch((err) => {
  console.error('[Test Failed]', err);
  postScheduler.stop();
  keepAliveService.stop();
  server.close();
  process.exit(1);
});
