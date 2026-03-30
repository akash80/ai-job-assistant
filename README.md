<div align="center">

# AI Job Assistant

### Your AI Co-Pilot for Job Applications

**Analyze job postings. Match your skills. Assist with application responses — all powered by AI.**

[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00897B?style=for-the-badge)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/License-Apache%202.0-D22128?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Webpack](https://img.shields.io/badge/Webpack-5-8DD6F9?style=for-the-badge&logo=webpack&logoColor=black)](https://webpack.js.org/)

---

*Stop wasting hours on repetitive job applications. Let AI assist you with repetitive parts while you stay in full control of every application. — landing your dream job.*

</div>

---

## What is AI Job Assistant?

AI Job Assistant is an open-source Chrome extension that acts as your intelligent co-pilot during the job application process. It uses OpenAI's API to:

- **Analyze job postings** — Extracts key requirements, skills, and qualifications from any job listing
- **Match your profile** — Compares the job requirements against your resume/skills to show fit percentage
- **AI-assisted form filling** — Suggests responses and helps pre-fill fields (user-triggered) based on your profile and the job context
- **Learn your style** — Adapts over time to your writing tone and preferred answers

> **Privacy-first:** All your data stays on your device. No backend servers. No tracking. No analytics. Your OpenAI API key is stored locally and calls go directly from your browser to OpenAI.

---

## Features

| Feature | Description |
|---------|-------------|
| **Job Analysis** | Extracts structured data from job postings on LinkedIn, Indeed, Glassdoor, and more |
| **Smart Field Detection** | Detects form fields on the page when you use Apply Assist (user-triggered) |
| **AI-assisted responses** | Suggests contextual, tailored text for application fields you choose to fill |
| **Skill Matching** | Shows how well your profile matches the job requirements |
| **Overlay UI** | Non-intrusive floating panel that stays with you as you fill applications |
| **Usage Tracking** | Monitors your API token usage to keep costs transparent |
| **Response Caching** | Caches AI responses to avoid redundant API calls and save money |
| **Zero Runtime Dependencies** | Runs entirely on browser-native APIs — fast and lightweight |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Platform | Chrome Extension (Manifest V3) |
| Language | JavaScript (ES2022+) |
| Build | Webpack 5 |
| Styling | Vanilla CSS + CSS Custom Properties |
| API | Native `fetch` to OpenAI |
| Storage | `chrome.storage.local` |
| Testing | Jest + jsdom |
| Linting | ESLint + Prettier |

**Zero production dependencies.** Everything runs on browser-native APIs.

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
│   │   ├── openai-client.js   # OpenAI API integration
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

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Google Chrome** 116+ (or any Chromium-based browser)
- **OpenAI API key** — [Get one here](https://platform.openai.com/api-keys)

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

**6. Configure your API key**

1. Click the extension icon and go to **Settings** (or right-click the icon and select **Options**)
2. Enter your OpenAI API key
3. You're ready to go!

---

## Usage

1. **Navigate to a job posting** on LinkedIn, Indeed, Glassdoor, or any supported platform
2. **Click the AI Job Assistant icon** — the extension analyzes the job posting and shows key details
3. **Open the application form** — when you continue, the extension can help detect fields as part of Apply Assist
4. **Click "Apply Assist"** on the floating overlay to preview fields and proceed with AI-assisted filling — use the prompter to **generate suggestions** for fields that need input
5. **Review and edit suggestions** before submitting your application — you are always responsible for final answers

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

# Run a specific test file
npx jest tests/unit/extractor.test.js
```

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
│  │ • Extractor   │                       │            │  │
│  │ • Fields      │                       │ • OpenAI   │  │
│  │ • Overlay     │                       │ • Storage  │  │
│  │ • Observer    │                       │ • Cache    │  │
│  └──────────────┘                       │ • Usage    │  │
│                                          └─────┬──────┘  │
│  ┌──────────────┐                              │         │
│  │ Popup UI     │ ◄─── chrome.storage ─────────┤         │
│  └──────────────┘                              │         │
│  ┌──────────────┐                              │         │
│  │ Options Page │ ◄─── chrome.storage ─────────┘         │
│  └──────────────┘                                        │
│                              │                           │
└──────────────────────────────┼───────────────────────────┘
                               │ fetch (user's API key)
                               ▼
                     ┌──────────────────┐
                     │   OpenAI API     │
                     │  (gpt-4o-mini)   │
                     └──────────────────┘
```

- **Content Script** — Injected into job pages; detects fields, extracts job data, renders the overlay UI
- **Service Worker** — Background process; handles OpenAI API calls, caching, storage, and usage tracking
- **Popup** — Quick-access UI when clicking the extension icon
- **Options Page** — Settings and configuration (API key, preferences)

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
- **Direct API calls** — Your OpenAI API key is never sent to any third-party server; calls go directly from your browser to OpenAI
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

| Version | Milestone |
|---------|-----------|
| **1.0.0** | Core extension — job analysis, field detection, AI-assisted form filling |
| **1.1.0** | Learning system — adapts to your writing style over time |
| **1.2.0** | PDF resume upload — parse and use your resume data |
| **1.3.0** | Cover letter generation — AI-crafted cover letters per job |
| **2.0.0** | Major UI redesign and architecture improvements |

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [OpenAI](https://openai.com/) for the API powering intelligent responses
- The Chrome Extensions team for [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- All open-source contributors who help make this project better

---

<div align="center">

**If AI Job Assistant helps you land your next role, consider giving it a star!**

**[Report Bug](https://github.com/akash80/ai-job-assistant/issues) · [Request Feature](https://github.com/akash80/ai-job-assistant/issues) · [Contribute](https://github.com/akash80/ai-job-assistant/pulls)**

</div>
