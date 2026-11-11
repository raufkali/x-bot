/**
 * Express Webhook Server for Meta WhatsApp Cloud API
 * Handles:
 * - GET /webhook (Meta verification handshake)
 * - POST /webhook (Receives owner's 1, 2, 3, 4, 5 replies or button taps)
 * - POST /generate (Trigger to create and send post to WhatsApp)
 * - GET /status (Check current in-memory approval state)
 */

import express from 'express';
import { config } from '../config.js';
import { whatsappWorkflow } from './workflow.js';
import { whatsappClient } from './client.js';
import { postScheduler } from '../utils/scheduler.js';
import { keepAliveService } from '../utils/keepAlive.js';
import { ansi } from '../utils/ansi.js';

const app = express();
app.use(express.json());

// ============================================================
// 1. WEBHOOK VERIFICATION (GET /webhook)
// Meta sends a GET request when configuring the webhook in Developer Dashboard.
// ============================================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`\n[Webhook Handshake] Received verification check with token: ${token}`);

  if (mode === 'subscribe' && token === config.webhookVerifyToken) {
    console.log(ansi.emeraldText('✓ Webhook successfully verified with Meta!'));
    res.status(200).send(challenge);
  } else {
    console.warn(ansi.yellowText('✕ Webhook verification failed. Token mismatch or invalid mode.'));
    res.sendStatus(403);
  }
});

// ============================================================
// 2. INBOUND MESSAGE RECEIVER (POST /webhook)
// Meta delivers messages and interactive button clicks here.
// ============================================================
app.post('/webhook', async (req, res) => {
  // Always acknowledge Meta with 200 OK immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log(`\n📩 [Inbound Webhook Received]:`, JSON.stringify(body));

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // Check if change contains messages (delivery statuses do not contain messages)
        const messages = value.messages || [];
        for (const message of messages) {
          const from = message.from; // Sender's phone number
          let incomingText = '';

          if (message.type === 'text') {
            incomingText = message.text?.body || '';
          } else if (message.type === 'interactive') {
            incomingText =
              message.interactive?.button_reply?.id ||
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.id ||
              message.interactive?.list_reply?.title ||
              '';
          } else if (message.type === 'button') {
            incomingText = message.button?.text || message.button?.payload || '';
          }

          if (incomingText) {
            console.log(`\n📩 [Inbound WhatsApp Message] From: ${from} | Text: "${incomingText}"`);
            await whatsappWorkflow.handleOwnerReply(incomingText, from);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook Error]', err);
  }
});

// ============================================================
// 3. TRIGGER POST & WAIT FOR OWNER DECISION (POST /trigger)
// Generates post, sends it to WhatsApp, and WAITS for owner's response
// ============================================================
app.post('/trigger', async (req, res) => {
  try {
    const customTopic = req.body?.topic || '';
    const timeoutMs = Number(req.body?.timeoutMs || req.query?.timeout || 300000);

    console.log(`\n⚡ [/trigger] Request received for topic: "${customTopic || 'Auto'}"`);
    console.log(`   Waiting up to ${Math.round(timeoutMs / 1000)}s for owner WhatsApp response...`);

    const result = await whatsappWorkflow.generateSendAndWait(customTopic, timeoutMs);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 4. TRIGGER POST GENERATION ASYNC (POST /generate)
// Endpoint to trigger a new post and send it immediately without waiting
// ============================================================
app.post('/generate', async (req, res) => {
  try {
    const customTopic = req.body?.topic || '';
    const result = await whatsappWorkflow.generateAndSend(customTopic);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 5. OWNER DIRECT RESPONSE / SIMULATION (POST /respond)
// Trigger an owner response directly over HTTP (e.g. for testing)
// ============================================================
app.post('/respond', async (req, res) => {
  try {
    const reply = req.body?.reply || req.body?.action || req.body?.text || '1';
    const from = req.body?.from || config.ownerPhoneNumber;

    const result = await whatsappWorkflow.handleOwnerReply(reply, from);
    res.status(200).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 4. TRIGGER TEMPLATE MESSAGE (POST /send-template)
// Endpoint to send pre-approved template message to recipient
// ============================================================
app.post('/send-template', async (req, res) => {
  try {
    const to = req.body?.to || config.ownerPhoneNumber;
    const templateName = req.body?.template || config.whatsappTemplateName;
    const language = req.body?.language || config.whatsappTemplateLang;
    const components = req.body?.components || [];

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const result = await whatsappClient.sendTemplate(to, templateName, language, components);
    res.status(200).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 6. SCHEDULER ENDPOINTS (GET/POST /schedule)
// View or update daily automatic post generation schedule
// ============================================================
app.get('/schedule', (req, res) => {
  res.status(200).json(postScheduler.getStatus());
});

app.post('/schedule', (req, res) => {
  try {
    const updated = postScheduler.updateConfig(req.body);
    res.status(200).json({ success: true, schedule: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 7. STATUS & HEALTH ENDPOINTS
// ============================================================
app.get('/status', (req, res) => {
  res.json({
    app: config.appName,
    version: config.appVersion,
    whatsappConfigured: whatsappClient.isConfigured(),
    ownerNumberConfigured: Boolean(config.ownerPhoneNumber),
    schedule: postScheduler.getStatus(),
    state: whatsappWorkflow.getCurrentState()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================
// START SERVER
// ============================================================
export function startServer(port = config.serverPort) {
  // Start the background post scheduler
  postScheduler.start();

  // Start the self-ping keep-alive service to prevent free Render from sleeping
  keepAliveService.start();

  return app.listen(port, () => {
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(ansi.boldText(`       ${ansi.emeraldText('X_BOT — WHATSAPP WEBHOOK SERVER RUNNING')}`));
    console.log(ansi.separator('=', 64, ansi.emerald));
    console.log(`  Local URL:        ${ansi.boldText(`http://localhost:${port}`)}`);
    console.log(`  Webhook Endpoint: ${ansi.emeraldText(`http://localhost:${port}/webhook`)}`);
    console.log(`  Verify Token:     ${ansi.cyanText(config.webhookVerifyToken)}`);
    console.log(`  WhatsApp Ready:   ${whatsappClient.isConfigured() ? ansi.emeraldText('YES') : ansi.yellowText('PENDING .env CREDENTIALS')}`);
    console.log(`  Owner Number:     ${config.ownerPhoneNumber ? ansi.emeraldText(config.ownerPhoneNumber) : ansi.yellowText('NOT SET YET')}`);
    console.log(ansi.separator('=', 64, ansi.emerald) + '\n');
    console.log(ansi.dimText('Ready to receive verification handshake and owner approval replies.\n'));
  });
}

// Auto-start if executed directly (e.g. `npm run webhook`)
if (process.argv[1]?.endsWith('server.js')) {
  startServer();
}

export default app;
