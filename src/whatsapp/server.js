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
              message.interactive?.list_reply?.id ||
              '';
          }

          if (incomingText) {
            console.log(`\n📩 [Inbound WhatsApp] From: ${from} | Text: "${incomingText}"`);
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
// 3. TRIGGER POST GENERATION (POST /generate)
// Endpoint to trigger a new post and send it to WhatsApp.
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
// 4. STATUS & HEALTH ENDPOINTS
// ============================================================
app.get('/status', (req, res) => {
  res.json({
    app: config.appName,
    version: config.appVersion,
    whatsappConfigured: whatsappClient.isConfigured(),
    ownerNumberConfigured: Boolean(config.ownerPhoneNumber),
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
