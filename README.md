<div align="center">

# AI Job Assistant

### Your AI Co-Pilot for Job Applications

**Analyze job postings. Match your skills. Fill application forms faster — with user-controlled AI assistance.**

[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ai-job-assistant/dapffogejkfmdonologlpimlifklgkji?hl=en&authuser=0)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00897B?style=for-the-badge)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/License-Apache%202.0-D22128?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Webpack](https://img.shields.io/badge/Webpack-5-8DD6F9?style=for-the-badge&logo=webpack&logoColor=black)](https://webpack.js.org/)

**Chrome Web Store:** [Install AI Job Assistant](https://chromewebstore.google.com/detail/ai-job-assistant/dapffogejkfmdonologlpimlifklgkji?hl=en&authuser=0)

---

*Stop wasting hours on repetitive job applications. Let AI assist you with repetitive parts while you stay in full control of every application. — landing your dream job.*

</div>

---

## Version

Current release: **v1.1.0** (single release for all features documented below)

## What’s new in v1.1.0

- **Multi-provider AI + smart routing**: Support for **OpenAI**, **Anthropic (Claude)**, and **Perplexity**, with an **AI router** that picks a sensible provider per task (analysis/parsing/writing vs real-time search).
- **Run without API keys (local analysis)**: Basic **on-device keyword/synonym matching** so you can still analyze and score jobs without configuring any provider.
- **Find Jobs (real-time search)**: Job discovery backed by **Perplexity** (requires a Perplexity API key).
- **Apply Assist upgrades**: More robust **field detection + mapping**, smarter handling of some **Workday repeatable sections**, and a **Fill Preview** so you approve what gets filled.
- **Resume PDF attach**: Store a resume PDF in Settings and attach it to supported upload fields during Apply Assist.
- **Session restore (“Continue”)**: If the application flow opens on a different URL/tab, the extension can restore recent job context and continue.
- **Caching + cost visibility**: Response caching to reduce repeated calls and a usage tracker for token/cost estimates.
- **Reliability + testing**: Expanded Jest test coverage across routing, providers, local analysis, prompts, storage/history, and form schema.

## What is AI Job Assistant?

AI Job Assistant is an open-source Chrome extension that acts as your intelligent co-pilot during the job application process. It can use **OpenAI**, **Anthropic (Claude)**, and **Perplexity** APIs — with automatic routing to the best provider for each task — or run **without any API key** using an on-device keyword analyzer.

- **Analyze job postings** — Extracts key requirements, skills, and qualifications from any job listing (AI or local analysis)
- **Match your profile** — Compares the job requirements against your resume/skills to show fit percentage
- **AI-assisted form filling** — Suggests responses and helps pre-fill fields (user-triggered) based on your profile and the job context
- **Multi-provider routing** — Job analysis and resume parsing prefer OpenAI, then Claude, then Perplexity; cover letters follow the same order; **Find Jobs** uses Perplexity for real-time search
- **Reusable answers** — Saves your repeated responses (e.g., links, sponsorship, notice period) so future applications fill faster and more consistently

> **Privacy-first:** All your data stays on your device. No backend servers. No tracking. No analytics. API keys are stored locally; when you use a provider, requests go **directly from your browser** to that provider’s API (OpenAI, Anthropic, and/or Perplexity).

---

## Table of Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Fill modes (Human / Fast / Bot)](#fill-modes-human--fast--bot)
- [FAQ](#faq)
- [Development](#development)
- [Architecture Overview](#architecture-overview)
- [Privacy & Security](#privacy--security)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

## Features

| Feature | Description |
|---------|-------------|
| **Job Analysis** | Extracts structured data from job postings on LinkedIn, Indeed, Glassdoor, and more |
| **Local analysis (no API key)** | Keyword- and synonym-based matching when no AI provider is configured, or when you opt into local analysis |
| **Multi-provider AI** | OpenAI, Anthropic Claude, and Perplexity — configure one or more keys; the extension routes each feature to a sensible default |
| **Find Jobs** | Real-time job discovery powered by Perplexity search (requires a Perplexity API key) |
| **Cover letter generation** | AI-generated cover letters routed through your configured providers |
| **Skills intelligence** | Tracks recurring skill gaps from high-match jobs to guide learning priorities |
| **Currency / salary display** | Optional FX rates via Frankfurter API for salary preferences in non-USD currencies |
| **Smart Field Detection** | Detects form fields on the page when you use Apply Assist (user-triggered) |
| **AI-assisted responses** | Suggests contextual, tailored text for application fields you choose to fill |
| **Skill Matching** | Shows how well your profile matches the job requirements |
| **Overlay UI** | Non-intrusive floating panel that stays with you as you fill applications |
| **Usage Tracking** | Monitors API token usage and estimated cost per configured model |
| **Response Caching** | Caches analysis results to avoid redundant API calls and save money |
| **Zero Runtime npm Dependencies** | Production bundle uses browser-native APIs only — fast and lightweight |

---

## How it works

AI Job Assistant is split into three browser contexts (content script, background service worker, extension UI) to keep it fast and privacy-friendly.

### Job analysis (posting → structured result)

- **Extract job text**: the content script reads visible job details from the page you opened.
- **Route the request**:
  - **OpenAI** (preferred) → job analysis + resume parsing + cover letters
  - **Anthropic (Claude)** → great writing quality, used when configured
  - **Perplexity** → required for **Find Jobs** (real-time search); can be a fallback for other tasks if it’s the only provider configured
  - **Local analysis** (no key) → basic keyword/synonym matching when no provider is configured or when you choose “Analyze Without AI”
- **Cache results**: analysis is cached so you don’t repeatedly pay for the same job post.
- **Continue across pages**: if a job’s application flow opens on a different URL, the extension can restore the last analysis session and show a “Continue” chip.

### Apply Assist (page → detected fields → fill preview → fill)

- **Detect fields**: scans the current page for inputs, selects, textareas, radios/checkboxes, and resume upload controls.
- **Map fields to your data**: matches labels/ids/placeholders/autocomplete signals to your profile + saved answers (includes smarter handling for some Workday repeatable sections).
- **Show a Fill Preview**: you can see what will be auto-filled vs what needs input.
- **Fill only what you approve**: unknown fields prompt you to answer (optionally saved for next time). Nothing is auto-submitted.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Platform | Chrome Extension (Manifest V3) |
| Language | JavaScript (ES2022+) |
| Build | Webpack 5 |
| Styling | Vanilla CSS + CSS Custom Properties |
| API | Native `fetch` to OpenAI, Anthropic, Perplexity, and Frankfurter (exchange rates) |
| Storage | `chrome.storage.local` |
| Testing | Jest + jsdom |
| Linting | ESLint + Prettier |

**Zero production npm dependencies.** Everything runs on browser-native APIs in the built extension.

---

## Project Structure

```
ai-job-assistant/
├── manifest.json              # Chrome Extension Manifest V3
├── webpack.config.js          # Webpack build configuration
├── package.json               # npm scripts & dev dependencies
├── jest.config.js             # Jest test configuration
├── .eslintrc.js               # ESLint rules
├── .prettierrc                # Prettier formatting config
│
├── src/
│   ├── background/            # Service worker (runs in background)
│   │   ├── service-worker.js  # Message handling & orchestration
│   │   ├── ai-router.js       # Provider selection (OpenAI / Anthropic / Perplexity)
│   │   ├── openai-client.js   # OpenAI API integration
│   │   ├── anthropic-client.js # Anthropic Claude API
│   │   ├── perplexity-client.js # Perplexity API (e.g. Find Jobs)
│   │   ├── local-analyzer.js  # Offline keyword-based job analysis
│   │   ├── exchange-rate-client.js # USD conversion factors (Frankfurter)
│   │   ├── storage-manager.js # Chrome storage operations
│   │   ├── usage-tracker.js   # API token usage tracking
│   │   └── cache-manager.js   # Response caching layer
│   │
│   ├── content/               # Content scripts (injected into web pages)
│   │   ├── content.js         # Entry point for content script
│   │   ├── content.css        # Content script styles
│   │   ├── extractor.js       # Job posting data extraction
│   │   ├── observer.js        # DOM mutation observer
│   │   ├── overlay.js         # Floating overlay UI
│   │   ├── overlay-styles.js  # Overlay CSS-in-JS
│   │   └── fields/            # Form field handling
│   │       ├── detector.js    # Field detection engine
│   │       ├── mapper.js      # Field-to-data mapping
│   │       ├── filler.js      # Smart field filling
│   │       └── prompter.js    # AI prompt generation for fields
│   │
│   ├── popup/                 # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   │
│   ├── options/               # Extension options/settings page
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   │
│   └── shared/                # Shared utilities & constants
│       ├── constants.js       # App-wide constants
│       ├── field-patterns.js  # Field detection patterns
│       ├── prompts.js         # AI prompt templates
│       └── utils.js           # Utility functions
│
├── assets/
│   ├── icons/                 # Extension icons (generated)
│   └── styles/
│       └── variables.css      # CSS custom properties
│
├── scripts/
│   └── generate-icons.js      # Icon generation script (sharp)
│
├── tests/
│   └── setup.js               # Jest setup with Chrome API mocks
│
└── dist/                      # Build output (git-ignored)
```

---

## Getting Started

### Install (recommended)

Install directly from the Chrome Web Store:

- [AI Job Assistant — Chrome Web Store](https://chromewebstore.google.com/detail/ai-job-assistant/dapffogejkfmdonologlpimlifklgkji?hl=en&authuser=0)

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Google Chrome** 116+ (or any Chromium-based browser)
- **API keys (optional)** — Add any combination you want:
  - [OpenAI](https://platform.openai.com/api-keys) — analysis, parsing, cover letters, Apply Assist
  - [Anthropic](https://console.anthropic.com/) — analysis, parsing, cover letters
  - [Perplexity](https://www.perplexity.ai/settings/api) — **Find Jobs** (real-time search)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/akash80/ai-job-assistant.git
cd ai-job-assistant
```

**2. Install dependencies**

```bash
npm install
```

**3. Generate extension icons**

Place your logo file at `assets/icons/logo.png`, then run:

```bash
node scripts/generate-icons.js
```

This generates the required icon sizes (16, 32, 48, 128px) for the Chrome extension.

**4. Build the extension**

```bash
# Development build (with watch mode)
npm run dev

# Production build
npm run build
```

**5. Load into Chrome**

1. Open `chrome://extensions/` in your browser
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from the project
5. The AI Job Assistant icon should appear in your toolbar

**6. Configure API keys (optional)**

1. Click the extension icon and go to **Settings** (or right-click the icon and select **Options**)
2. Under **API Configuration**, add keys for the providers you use (OpenAI, Anthropic, **Gemini**, and/or Perplexity)
3. Without any key, you can still use **local job analysis** once resume or profile skills are set up
4. Save settings — you're ready to go

---

## Usage

1. **Navigate to a job posting** on LinkedIn, Indeed, Glassdoor, or any supported platform
2. **Click the AI Job Assistant icon** — the extension analyzes the job posting and shows key details
3. **Open the application form** — when you continue, the extension can help detect fields as part of Apply Assist
4. **Click "Apply Assist"** on the floating overlay to preview fields and proceed with AI-assisted filling — use the prompter to **generate suggestions** for fields that need input
5. **Review and edit suggestions** before submitting your application — you are always responsible for final answers

---

## Fill modes (Human / Fast / Bot)

In **Settings → Preferences → Form Filling**, you can choose a Fill Mode:

- **Human**: realistic typing with pauses and occasional tiny delays (slowest, most “human-like”).
- **Fast**: quickly types while still triggering typing/input events (recommended for most sites).
- **Bot**: sets values instantly (fastest). Still fires input/change events, but some sites may require extra manual interaction.

Tip: if a site is “fussy” (custom widgets, heavy validation), try **Fast** first; if it still doesn’t take the value, switch to **Human** for that flow.

---

## FAQ

### AI + providers

**1) Do I need an API key to use AI Job Assistant?**  
No. You can use **basic local job analysis** without any key. For best results (analysis, resume parsing, cover letters), add **OpenAI** or **Anthropic**. For **Find Jobs**, you need a **Perplexity** key.

**How to get API keys (quick guide)**

- **Gemini (Google AI Studio) — free tier available**
  - Go to `https://aistudio.google.com/app/apikey`
  - Click **Create API key**
  - Copy the key and paste it into **Settings → API Configuration → Gemini**

- **OpenAI**
  - Go to `https://platform.openai.com/api-keys`
  - Create a new secret key
  - Copy the key and paste it into **Settings → API Configuration → OpenAI**

- **Anthropic (Claude)**
  - Go to `https://console.anthropic.com/settings/keys`
  - Create a key
  - Copy the key and paste it into **Settings → API Configuration → Anthropic**

- **Perplexity**
  - Go to `https://www.perplexity.ai/settings/api`
  - Create/copy an API key
  - Paste it into **Settings → API Configuration → Perplexity** (required for **Find Jobs**)

**2) Which AI provider is best for job analysis?**  
In v1.1.0, job analysis prefers **OpenAI** first, then **Anthropic**, then **Gemini**, then **Perplexity** (if it’s the only provider configured). OpenAI tends to produce the most consistent structured JSON for scoring and missing skills.

**3) Which AI provider is best for cover letters?**  
Cover letters route to **OpenAI** or **Anthropic** when available. Many users prefer Claude for writing style, while OpenAI is often more concise and structured.

**4) Why does Find Jobs require Perplexity?**  
Find Jobs uses **real-time web search** to surface current postings. In this extension’s architecture, that feature is implemented using **Perplexity**.

**5) What happens if I configure multiple providers?**  
The extension uses a **smart AI router**: it selects the best provider for each task based on configured keys and the task type (analysis vs writing vs real-time search).

**6) Can I run everything locally (no AI calls)?**  
Yes for basic job analysis and matching. Resume parsing, cover letters, and some higher-quality structured outputs require an AI provider.

**7) Where are API keys stored?**  
Locally in your browser via `chrome.storage.local`. There is **no backend** in this project.

**8) Does AI Job Assistant send my data to your servers?**  
No. Requests go **directly from your browser** to OpenAI/Anthropic/Perplexity (only if you configure them). There is no custom server.

### Filling forms faster

**9) How do I fill application forms faster?**  
Use **Apply Assist**. It detects fields, shows a Fill Preview, then fills known fields using your **Profile** and **Saved Answers**. Set Fill Mode to **Fast** or **Bot** for speed.

**10) What is Fill Mode?**  
Fill Mode controls *how* values are entered into fields:
- **Human** simulates typing with realistic delays
- **Fast** types quickly but still triggers typing/input events
- **Bot** sets values instantly (fastest)

**11) What’s the difference between Fast mode and Bot mode?**  
**Fast** behaves like rapid typing (better compatibility with sites that listen to typing events). **Bot** sets the final value instantly (best speed), but some sites may not fully react the same way.

**12) Which Fill Mode should I choose?**  
Start with **Fast** (recommended). If a site is strict or values don’t “stick,” try **Human**. If everything works and you want maximum speed, use **Bot**.

**13) Will the extension submit applications for me?**  
No. AI Job Assistant is **user-controlled**. It helps you fill fields, but it does not press submit automatically or bypass CAPTCHAs/OTP.

**14) Can it fill resume upload fields automatically?**  
Yes, if you uploaded a **Resume PDF** in Settings. On pages that contain a resume upload field, Apply Assist can attach the stored PDF.

**15) What if the form already has values?**  
In Fill Preview, you can choose **Overwrite fields that already have values**. Leave it unchecked to keep existing answers untouched.

**16) What if a field is unknown or not recognized?**  
Apply Assist will prompt you for an answer. You can optionally enable **Remember this answer** so future forms auto-fill it.

**17) Does it work on Workday, Greenhouse, Lever, and company ATS portals?**  
It’s designed to work across many portals. Some sites use custom widgets; if a field doesn’t fill correctly, try **Human** mode, or fill that one field manually.

### Job analysis + “how we analyze the page”

**18) How does AI Job Assistant analyze a page?**  
It extracts job-related text from the current page, then runs either:
- **AI analysis** (OpenAI/Claude/Perplexity via the background service worker), or
- **Local analysis** (keyword/synonym matching) when no key is configured or when you choose it.

**19) Why does it say “Basic analysis — No AI key configured”?**  
That banner means the extension used local analysis instead of a provider, so the results may be less accurate and less structured.

**20) Why didn’t analysis run on this page?**  
Common reasons:
- The page doesn’t look like a job posting (not enough job text)
- The page is a multi-step application form without the posting content
- The job text on the page is too short (under ~100 characters)

**21) Can it continue analysis when the application opens in a new tab or URL?**  
Yes. v1.1.0 saves recent job sessions and may show a **Continue** chip on application pages so you can reopen the assistant with the prior job context.

**22) Is job analysis cached?**  
Yes. The extension caches analysis results to reduce repeated calls and cost, and to make returning to a job post faster.

### Profile, resume, saved answers

**23) Do I need to paste my resume text?**  
For AI parsing and best matching, yes. Paste your resume text in Settings → Resume, then “Save & Parse with AI” (or generate JSON using an external AI and import it).

**24) Can I upload a PDF resume instead of pasting text?**  
You can upload a PDF for **resume attachment** during Apply Assist. For parsing into a structured profile, the extension uses the **Resume Text** box (you can extract text from text-based PDFs).

**25) What are Saved Answers used for?**  
They store your repeatable responses (like sponsorship, notice period, expected salary, links) so Apply Assist can auto-fill them across sites.

**26) How does “Remember this answer” work?**  
When prompted for an unknown field, you can save your response. Next time, the extension can auto-fill similar questions using that stored answer.

### Cost, reliability, troubleshooting

**27) Does it track token usage and estimated cost?**  
Yes. Usage and estimates are tracked per model/provider so you can see roughly what you’re spending.

**28) What should I do if a site blocks auto-fill or keeps clearing values?**  
Try **Human** Fill Mode, disable overwrite (so you don’t fight the site), and fill the remaining fields manually. Some sites re-render fields after input.

**29) Is it safe to use on employer sites?**  
The extension is designed to be user-triggered and privacy-first. You should still follow each site’s policies and review every answer before submitting.

**30) How do I reset or move my data to a new machine?**  
Use Settings → **Data Management** to export all data (profile, answers, history) and import it elsewhere, or clear it when needed.

---

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Webpack in development + watch mode |
| `npm run build` | Create optimized production build in `dist/` |
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source files with ESLint |
| `npm run format` | Format code with Prettier |

### Development Workflow

1. Run `npm run dev` to start the watcher
2. Make changes to files in `src/`
3. Webpack automatically rebuilds into `dist/`
4. **For background/popup/options changes:** click the reload button on `chrome://extensions/`
5. **For content script changes:** refresh the web page you're testing on

### Debugging

| Component | How to Debug |
|-----------|-------------|
| Service Worker | `chrome://extensions/` → click "Inspect views: service worker" |
| Content Script | Right-click page → Inspect → Console (filter by extension name) |
| Popup | Right-click extension icon → Inspect popup |
| Options Page | Open options page → Right-click → Inspect |

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage report + coverage gate
npm run test:coverage

# CI-friendly (serial, coverage enabled)
npm run test:ci

# Run a specific test file
npm test -- tests/utils.test.js
```

### Local `.env` (optional; for tests/dev only)

- Copy `[.env.example](f:/work/ai-job-assistant/.env.example)` to `.env` and add any keys you want.
- `.env` is gitignored (to prevent accidentally committing API keys).
- The extension itself stores keys in `chrome.storage.local`; `.env` is only loaded in the Jest runtime.

---

## Architecture Overview

The extension follows a clear separation of concerns across Chrome extension contexts:

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│                                                         │
│  ┌──────────────┐    chrome.runtime     ┌────────────┐  │
│  │ Content       │ ◄──── messages ─────► │ Background │  │
│  │ Script        │                       │ Service    │  │
│  │               │                       │ Worker     │  │
│  │ • Extractor   │                       │ • AI router│  │
│  │ • Fields      │                       │ • Storage  │  │
│  │ • Overlay     │                       │ • Cache    │  │
│  │ • Observer    │                       │ • Usage    │  │
│  └──────────────┘                       └─────┬──────┘  │
│  ┌──────────────┐                              │         │
│  │ Popup UI     │ ◄─── chrome.storage ─────────┤         │
│  └──────────────┘                              │         │
│  ┌──────────────┐                              │         │
│  │ Options Page │ ◄─── chrome.storage ─────────┘         │
│  └──────────────┘                                        │
│                              │                           │
└──────────────────────────────┼───────────────────────────┘
                               │ fetch (your API keys)
                               ▼
              ┌────────────────────────────────────┐
              │ OpenAI · Anthropic · Perplexity    │
              │ (+ Frankfurter for FX, if used)    │
              └────────────────────────────────────┘
```

- **Content Script** — Injected into job pages; detects fields, extracts job data, renders the overlay UI
- **Service Worker** — Background process; routes AI calls, local analysis, caching, storage, and usage tracking
- **Popup** — Quick-access UI when clicking the extension icon
- **Options Page** — Settings and configuration (API keys, models, preferences)

All communication happens via `chrome.runtime.sendMessage` and `chrome.storage`.

---

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 116+ | Full | Primary target |
| Edge 116+ | Full | Chromium-based |
| Brave | Full | Chromium-based |
| Opera | Full | Chromium-based |
| Firefox | Planned | Manifest V3 support varies |
| Safari | Not planned | Different extension API |

---

## Performance

The extension is designed to be lightweight and fast:

| Metric | Budget |
|--------|--------|
| Total extension size (zipped) | < 500 KB |
| Content script JS | < 50 KB |
| Content script CSS | < 10 KB |
| Initial execution time | < 100ms |
| Memory overhead per tab | < 5 MB |

---

## Privacy & Security

AI Job Assistant is built with a **privacy-first** approach:

- **No data collection** — Zero analytics, zero telemetry, zero tracking
- **Local storage only** — All user data stays in `chrome.storage.local` on your device
- **Direct API calls** — Keys are never sent to a custom backend; calls go from your browser to each provider you configure (OpenAI, Anthropic, Perplexity) and to Frankfurter only for optional currency conversion
- **No backend** — There is no server component; the extension is fully client-side
- **Open source** — The entire codebase is auditable

---

## Automation & User Control

AI Job Assistant is designed as a **user-controlled assistant**, not an automation bot.

- No automatic job applications are submitted
- No actions are performed without explicit user interaction
- Users must review and approve all AI-generated responses
- The extension does **not** bypass CAPTCHA, OTP, or authentication systems

All features are triggered manually by the user.

---

## Supported Platforms

Works on platforms like LinkedIn, Indeed, Glassdoor, and other job portals.

The extension only reads job-related content on pages you open and assists you interactively. It does not mass-submit applications, run in the background without your action, or bypass site protections or terms of service.

---

## Contributing

Contributions are welcome! Here's how you can help:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ai-job-assistant.git
   ```
3. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Install dependencies** and start developing:
   ```bash
   npm install
   npm run dev
   ```
5. **Make your changes**, ensuring:
   - Code passes linting: `npm run lint`
   - Code is formatted: `npm run format`
   - Tests pass: `npm test`
6. **Commit** your changes with a clear message
7. **Push** to your fork and open a **Pull Request**

### Contribution Ideas

- Add support for more job platforms
- Improve field detection accuracy
- Add new AI prompt templates
- Write unit tests
- Improve documentation
- Report bugs or suggest features via [Issues](https://github.com/akash80/ai-job-assistant/issues)

### Code Style

- ES2022+ JavaScript (no TypeScript)
- Prettier for formatting (runs on save or via `npm run format`)
- ESLint for code quality (via `npm run lint`)
- Keep dependencies minimal — prefer browser-native APIs

---

## Roadmap

### Released

- **v1.1.0**: See [What’s new in v1.1.0](#whats-new-in-v110)

### Future ideas (no version assigned)

- Improve field detection across more ATS portals and custom widgets
- Richer PDF resume workflows (better extraction, stronger mapping)
- Stronger personalization (user-controlled writing preferences and reusable answer templates)
- UI polish and accessibility improvements

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [OpenAI](https://openai.com/), [Anthropic](https://www.anthropic.com/), and [Perplexity](https://www.perplexity.ai/) for APIs that power intelligent responses when you choose to use them
- The Chrome Extensions team for [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- All open-source contributors who help make this project better

---

<div align="center">

**If AI Job Assistant helps you land your next role, consider giving it a star!**

**[Report Bug](https://github.com/akash80/ai-job-assistant/issues) · [Request Feature](https://github.com/akash80/ai-job-assistant/issues) · [Contribute](https://github.com/akash80/ai-job-assistant/pulls)**

</div>
