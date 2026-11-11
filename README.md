# X_BOT — AI Multilingual Content Generation Engine for X (Twitter)

> **Part 1 Prototype** — Automated multilingual social media generation engine for X (Twitter) using free Grok Chat.

---

## 📌 Project Overview

**X_BOT** transforms topics, news, or ideas into high-engagement X (Twitter) posts across **three language versions**:

1. **English** (Simple, clear, engaging hook)
2. **Roman Urdu** (Conversational Pakistani Urdu written in Latin script)
3. **Plain Urdu** (Proper Urdu script with natural phrasing)

This prototype represents **Part 1** of a larger system. It focuses purely on **content generation, multilingual accuracy, and approval simulation** within the terminal console before integrating WhatsApp bot workflows and automated X publishing in Part 2.

---

## 🎯 Architecture & Comparison with Binance Square Bot

This repository is an independent project inspired by the structured social post engine concept in [`Binance_Square_Bot`](https://github.com/raufkali/Binance_Square_Bot), but tailored specifically for **X (Twitter)** with all unwanted components removed:

| Feature / Component | Binance Square Bot | X_BOT (This Repository) |
| :--- | :--- | :--- |
| **Target Platform** | Binance Square & LinkedIn | **X (Twitter)** |
| **Languages** | English only | **English, Roman Urdu, & Plain Urdu** |
| **AI Provider** | Groq API (Paid/Freemium API key) | **Free Grok Chat (https://grok.com)** |
| **Image Generation** | Cloudflare Flux AI (Removed) | **None** (Clean text & hashtags for X) |
| **Database** | MongoDB / Mongoose (Removed) | **None** (Strictly in-memory runtime) |
| **State Persistence**| `bot-state.json` (Removed) | **Zero disk persistence** (React/CLI state only) |
| **User Interface** | Background cron / HTTP webhook | **Interactive Terminal CLI & Modular Engine** |

---

## 🚀 Key Features

- **Multilingual 3-Language Generation**: Every post idea produces English, Roman Urdu, and Plain Urdu.
- **Scalable Post Ideas**:
  - 1 Idea = 3 Language versions
  - 5 Ideas = 15 Language versions
  - 10 Ideas = 30 Language versions
- **Dual Grok Modes**:
  - **Automated Mode**: Connects via Playwright / Chrome DevTools Protocol (CDP) to an authenticated Grok Chat session.
  - **Manual Grok Mode**: Generates an optimized master prompt for https://grok.com, allows the user to copy-paste the output, and parses the 3 languages with zero data loss.
- **Character Counter & Unicode Weighting**: Real-time calculation using X's character weighting algorithm (280-character limit warning).
- **Independent Regeneration**: Regenerate English, Roman Urdu, or Plain Urdu individually with custom feedback (e.g., *"Make it shorter and use simpler words"*) without affecting the other two languages.
- **Approval Workflow Simulation**: Review, approve, or reject versions in-memory to simulate the future WhatsApp approval step.
- **Strictly In-Memory**: No database, no local files, no persistent storage.

---

## 📂 Project Structure

```
X_BOT/
├── src/
│   ├── index.js                # CLI entry point (npm start)
│   ├── config.js               # Environment and runtime configuration
│   ├── generator/
│   │   ├── promptBuilder.js    # Grok prompts & single/all-language regen prompts
│   │   ├── contentGenerator.js # Coordinates generation & in-memory session
│   │   ├── grokBrowser.js      # Playwright / CDP browser automation
│   │   └── responseParser.js   # Robust parser for 1/5/10 posts, languages, hashtags
│   ├── cli/
│   │   ├── menu.js             # Terminal interactive menu loop
│   │   ├── display.js          # ANSI terminal cards & character counters
│   │   └── input.js            # Single-line and multiline paste handlers
│   └── utils/
│       ├── validation.js       # Topic validation & X character weighting
│       └── ansi.js             # ANSI styling, colors, and badges
├── test/
│   └── test-generator.js       # Complete 8-part automated test suite
├── .env.example                # Sample environment configuration
├── .gitignore
├── package.json
└── README.md
```

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+ (tested on Node.js 24)
- npm 9+

### 1. Clone or Open the Repository
```bash
cd X_BOT
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment (Optional)
Copy the example environment file:
```bash
cp .env.example .env
```

Configuration options in `.env`:
- `GROK_MODE`: `auto` (attempts browser first, falls back to manual) or `manual` (pure prompt generation and paste).
- `CHROME_CDP_URL`: Optional remote debugging URL (e.g., `http://localhost:9222`) to attach to an already logged-in Chrome instance.
- `BROWSER_HEADLESS`: `true` or `false`.

---

## 💻 Running the Application

Start the interactive CLI:
```bash
npm start
```

### Main Menu Options:
1. **Generate New Content**: Input any topic, select tone, target audience, and number of posts (1, 5, or 10).
2. **Quick Test with Spec Topic**: Instantly runs the preloaded test topic (*Future of Global Power by 2035*).
3. **Toggle Grok Mode**: Switch between `AUTOMATED` and `MANUAL` modes.
4. **Exit**.

---

## 🧪 Testing

Run the automated test suite verifying topic validation, prompt building, 1/5/10 post scaling (up to 30 language versions), character weighting, and regeneration:

```bash
npm test
```

Expected output:
```
====================================================
           RUNNING X_BOT TEST SUITE
====================================================

TEST 1: Validating Topic Input...
✓ TEST 1 PASSED: Topic validation working as expected.

TEST 2: Testing X Character Counter & Unicode Weighting...
✓ TEST 2 PASSED: Character counting and Unicode weighting working.

TEST 3: Testing Prompt Building for 1, 5, and 10 posts...
✓ TEST 3 PASSED: Prompt builder accurately constructs prompts for 1, 5, and 10 posts.

TEST 4: Parsing 1 Post Idea (English, Roman Urdu, Plain Urdu)...
✓ TEST 4 PASSED: Parsed 1 post idea into 3 distinct languages with hashtags.

TEST 5: Testing 5 Post Ideas (15 Language Versions)...
✓ TEST 5 PASSED: 5 post ideas parsed with 15 language versions.

TEST 6: Testing 10 Post Ideas (30 Language Versions)...
✓ TEST 6 PASSED: 10 post ideas parsed with 30 total language versions.

TEST 7: Testing Single Language Regeneration and Memory State Update...
✓ TEST 7 PASSED: Single language regeneration updates memory without touching others.

TEST 8: Testing Approval & Rejection Simulation...
✓ TEST 8 PASSED: Approval and rejection workflow operating cleanly in-memory.

====================================================
    ALL 8 TESTS PASSED SUCCESSFULLY! (100%)
====================================================
```

---

## 📝 Example Output Format

```
----------------------------------------------------------------
  POST IDEA 01
----------------------------------------------------------------

  [1] ENGLISH   [PENDING REVIEW] 

    By 2035, the world will not be controlled by just one country.
    Power will be shared among several nations. AI will become like
    electricity. Money will move digitally. Minerals will become the
    new oil. Food and seeds will become strategic assets.

    The five pillars of future power will be data, energy, minerals,
    food, and payment systems.

    #AI #FutureOfTechnology #GlobalPower

  Length: [278/280 chars]

----------------------------------------------------------------

  [2] ROMAN URDU   [PENDING REVIEW] 

    2035 tak duniya par sirf aik mulk ka control nahi hoga.
    Mukhtalif mulkon ke paas apni taqat hogi. AI bijli ki tarah
    zaroori ho jaye gi. Paisa digital ho ga. Minerals naye petrol
    ki tarah ahmiyat hasil karenge. Khana aur beej bhi taqat ka
    zariya banenge.

    Mustaqbil ki taqat 5 cheezon par depend karegi: data, energy,
    minerals, khana aur payment systems.

    #AI #Mustaqbil #Technology

  Length: [265/280 chars]

----------------------------------------------------------------

  [3] PLAIN URDU (اردو)   [PENDING REVIEW] 

    ۲۰۳۵ تک دنیا پر صرف ایک ملک کا کنٹرول نہیں ہوگا۔ مختلف ممالک
    کے پاس اپنی طاقت ہوگی۔ مصنوعی ذہانت بجلی کی طرح ضروری ہو جائے
    گی۔ پیسہ ڈیجیٹل ہو جائے گا۔ معدنیات نئے تیل کی طرح اہمیت حاصل
    کریں گی۔ خوراک اور بیج بھی طاقت کا ذریعہ بنیں گے۔

    مستقبل کی طاقت پانچ چیزوں پر منحصر ہوگی: ڈیٹا، توانائی، معدنیات،
    خوراک اور ادائیگی کے نظام۔

    #AI #مستقبل #ٹیکنالوجی

  Length: [268/280 chars]

----------------------------------------------------------------
```

---

## 📱 Meta WhatsApp Cloud API Integration (Owner Approval)

X_BOT includes an **Express Webhook Server** ready to connect with Meta's official WhatsApp Cloud API.

### 1. Environment Variables (`.env`)
```env
WHATSAPP_TOKEN=your_meta_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
OWNER_PHONE_NUMBER=923001234567 # Your WhatsApp number with country code
WEBHOOK_VERIFY_TOKEN=xbot_verify_token_2026
PORT=3000
```

### 2. Start the WhatsApp Webhook Server
```bash
npm run webhook
```
This runs the Express server listening on `http://localhost:3000`.

- **Webhook URL for Meta Dashboard:** `https://your-domain-or-ngrok/webhook`
- **Verify Token:** `xbot_verify_token_2026` (or whatever you set in `WEBHOOK_VERIFY_TOKEN`)

### 3. Trigger Post Generation and Send to WhatsApp
To generate a fresh post and send it directly to your WhatsApp for approval:
```bash
npm run send:whatsapp
```
Or via HTTP POST request:
```bash
curl -X POST http://localhost:3000/generate -H "Content-Type: application/json" -d '{"topic": "Future of AI in 2035"}'
```

### 4. Approving from WhatsApp
When the post arrives on your WhatsApp, simply reply:
- **`1`** ➔ Approves **English** version
- **`2`** ➔ Approves **Roman Urdu** version
- **`3`** ➔ Approves **Plain Urdu** version
- **`4`** ➔ Retries and generates a fresh post
- **`5`** ➔ Discards the post

### 5. Check Approval Status
```bash
curl http://localhost:3000/status
```

---

## 🧪 Testing WhatsApp Webhooks

Run the automated test suite for the WhatsApp webhook server:
```bash
node test/test-whatsapp.js
```
All tests verify the Meta verification handshake, token validation, inbound message parsing, and in-memory approval state transitions.
