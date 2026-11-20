/**
 * Test Suite for WhatsApp Webhook Server and Approval Workflow
 */

import assert from 'assert';
import app, { startServer } from '../src/whatsapp/server.js';
import { whatsappWorkflow } from '../src/whatsapp/workflow.js';
import { postScheduler } from '../src/utils/scheduler.js';
import { keepAliveService } from '../src/utils/keepAlive.js';
import { config } from '../src/config.js';
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
    await whatsappWorkflow.generateAndSend('Global Artificial Intelligence Breakthroughs');
    const state = whatsappWorkflow.getCurrentState();
    assert.strictEqual(state.status, 'AWAITING_APPROVAL');
    assert.ok(state.currentPendingPost, 'Pending post should exist in memory');
    assert.ok(state.currentPendingPost.english.text, 'English text should exist');
    assert.strictEqual(state.currentPendingPost.activeView, 'ENGLISH');
    console.log('✓ TEST 4 PASSED: 1 English post generated with action options ready.\n');

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
    assert.ok(
      wakeResult.message.includes('view trends') || wakeResult.message.includes('trending topics'),
      'Greeting message must include trends option'
    );
    console.log('✓ TEST 8 PASSED: Initial SMS greeted owner with refined menu.\n');

    // TEST 9: Owner Pressing "1" to Generate New Post
    console.log('TEST 9: Simulating Owner Pressing "1" to Generate Post...');
    const generateResult = await whatsappWorkflow.handleOwnerReply('1', config.ownerPhoneNumber);
    assert.strictEqual(generateResult.success, true);
    assert.strictEqual(whatsappWorkflow.status, 'AWAITING_APPROVAL');
    assert.ok(whatsappWorkflow.currentPendingPost, 'New post is generated and awaiting review');
    console.log('✓ TEST 9 PASSED: Pressing 1 triggered trending post generation!\n');

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

    // TEST 13: Option 2 — View Today's Trending Topics
    console.log('TEST 13: Testing Option 2 (View Today\'s Trending Topics)...');
    whatsappWorkflow.currentPendingPost = null;
    const trendsResult = await whatsappWorkflow.handleOwnerReply('2', config.ownerPhoneNumber);
    assert.strictEqual(trendsResult.action, 'TRENDS_LIST');
    assert.ok(Array.isArray(trendsResult.trends), 'Trends must be an array');
    assert.ok(trendsResult.trends.length > 0, 'Trends array must have items');
    assert.ok(trendsResult.message.includes('Trending Topics'), 'Message should announce trending topics');
    console.log('✓ TEST 13 PASSED: Viewing trending topics returned fresh topic list!\n');

    // TEST 14: Option 3 — Entering Custom Topic Mode
    console.log('TEST 14: Testing Option 3 (Custom Topic Mode)...');
    whatsappWorkflow.currentPendingPost = null;
    const customPromptResult = await whatsappWorkflow.handleOwnerReply('3', config.ownerPhoneNumber);
    assert.strictEqual(customPromptResult.action, 'AWAITING_CUSTOM_TOPIC');
    assert.strictEqual(whatsappWorkflow.menuState, 'AWAITING_CUSTOM_TOPIC');
    assert.ok(customPromptResult.message.includes('Custom Topic Post'));
    console.log('✓ TEST 14 PASSED: Option 3 successfully entered AWAITING_CUSTOM_TOPIC state!\n');

    // TEST 15: Option 0 — Cancelling Custom Topic Mode
    console.log('TEST 15: Testing Cancelling Custom Topic Mode (Sending 0)...');
    const cancelCustomResult = await whatsappWorkflow.handleOwnerReply('0', config.ownerPhoneNumber);
    assert.strictEqual(cancelCustomResult.action, 'MENU_CANCELLED');
    assert.strictEqual(whatsappWorkflow.menuState, 'DEFAULT');
    assert.strictEqual(whatsappWorkflow.status, 'AWAITING_GENERATE');
    console.log('✓ TEST 15 PASSED: Sending 0 cleanly cancelled back to Main Menu!\n');

    // TEST 16: Generating Post with Direct Custom Topic
    console.log('TEST 16: Generating Post with User-Forced Custom Topic...');
    await whatsappWorkflow.handleOwnerReply('3', config.ownerPhoneNumber);
    const customGenResult = await whatsappWorkflow.handleOwnerReply('The Future of Quantum Computing', config.ownerPhoneNumber);
    assert.strictEqual(customGenResult.success, true);
    assert.strictEqual(whatsappWorkflow.status, 'AWAITING_APPROVAL');
    assert.ok(whatsappWorkflow.currentPendingPost, 'Pending post must exist');
    assert.strictEqual(whatsappWorkflow.currentPendingPost.category, 'CUSTOM_TOPIC');
    console.log('✓ TEST 16 PASSED: User-forced custom topic post generated successfully!\n');

    // TEST 17: Option 6 on Post Review Menu (View Trending Topics)
    console.log('TEST 17: Testing Option 6 on Post Review Menu (View Trending Topics)...');
    const opt6Result = await whatsappWorkflow.handleOwnerReply('6', config.ownerPhoneNumber);
    assert.strictEqual(opt6Result.action, 'TRENDS_LIST');
    assert.ok(opt6Result.message.includes('Reply *0* to return to your pending post review'));
    console.log('✓ TEST 17 PASSED: Option 6 during review surfaced trending topics!\n');

    // TEST 18: Option 0 — Return to Post Review
    console.log('TEST 18: Testing Option 0 from Trends View (Return to Post Review)...');
    const backToReview = await whatsappWorkflow.handleOwnerReply('0', config.ownerPhoneNumber);
    assert.strictEqual(backToReview.action, 'RETURNED_TO_POST_REVIEW');
    assert.ok(whatsappWorkflow.currentPendingPost, 'Pending post preserved');
    console.log('✓ TEST 18 PASSED: Option 0 cleanly returned to active post review!\n');

    // TEST 19: Option 5 (Fresh Regeneration of another trend — Anti-Duplication)
    console.log('TEST 19: Testing Option 5 (Regenerate fresh post)...');
    const prevTopic = whatsappWorkflow.currentPendingPost.topic;
    const regenResult = await whatsappWorkflow.handleOwnerReply('5', config.ownerPhoneNumber);
    assert.strictEqual(regenResult.success, true);
    assert.ok(whatsappWorkflow.currentPendingPost, 'Fresh post must be active');
    const newTopic = whatsappWorkflow.currentPendingPost.topic;
    console.log(`   Prev topic: "${prevTopic}" -> New topic: "${newTopic}"`);
    console.log('✓ TEST 19 PASSED: Option 5 generated fresh post!\n');

    // TEST 20: Option 7 (Mark post as used - Never to be reused)
    console.log('TEST 20: Testing Option 7 (Mark post as used - Never to be reused)...');
    const postToMark = whatsappWorkflow.currentPendingPost;
    assert.ok(postToMark, 'Must have a pending post to mark as used');
    const markedTopic = postToMark.topic;
    const markedText = postToMark.english.text;

    const markResult = await whatsappWorkflow.handleOwnerReply('7', config.ownerPhoneNumber);
    assert.strictEqual(markResult.action, 'MARKED_USED');
    assert.strictEqual(markResult.status, 'MARKED_USED');
    assert.strictEqual(whatsappWorkflow.currentPendingPost, null, 'Pending post cleared');

    assert.strictEqual(historyStore.hasSeenTopic(markedTopic), true, 'Marked topic must be indexed in historyStore');
    const duplicateCheck = historyStore.isDuplicateOrSimilar(markedText, markedTopic);
    assert.strictEqual(duplicateCheck.isDuplicate, true, 'Marked post recognized as duplicate');
    console.log(`   ✓ Marked post "${markedTopic}" is permanently recorded as USED (reason: ${duplicateCheck.reason})`);
    console.log('✓ TEST 20 PASSED: Option 7 successfully marks post as used!\n');

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
