# Study Tools Web

This is the official Web / PWA version of **Study Tools**, a multilingual exam prep and interactive study platform for IT candidates.

## 🔗 Quick Links
- **Live Online Edition**: [https://study-tools-web-pages.pages.dev](https://study-tools-web-pages.pages.dev)
- **Windows Full Portable Version (v2026.6.11)**: [Download Release Zip](https://github.com/bwins0668/it-study-tools/releases/tag/v2026.6.11)

---

## 💻 Web Public vs. Windows Full Version

The Web Public edition is optimized for quick previews, lightweight study, and mobile browsing. However, it runs in a restricted browser sandbox.

| Feature | Web Public Edition | Windows Full Version (Portable) |
|---|---|---|
| **SQL/MySQL Playground** | Runs locally in browser via **SQLite WASM** | Runs locally using full **Python-SQLite bridge** |
| **Java Sandbox Execution** | Web Safe Mode warning (No server execution) | Runs locally via embedded **JDK 21** |
| **Python Sandbox Execution** | Web Safe Mode warning (No server execution) | Runs locally via embedded **Python 3.12** |
| **Offline Capabilities** | Supported via PWA / Service Worker cache | **100% Offline offline executable** (Zero dependencies) |
| **Database & History** | Stored in browser memory | Stored in local SQL database (`study_ai.db`) |
| **AI Learning Mentor** | Requires user's own API keys | Supports local and remote AI integration |

*Note: AI-backed translation fallback via `/api/i18n/translate` is disabled on the public web runtime to eliminate 405 preflight log noise. It falls back to static multilingual content packs (en/vi/my/fr).*

---

## 🚀 Key Features

1. **Interactive SQL Sandboxes & CBT Exams**: Test your SQL query skills online using SQLite WASM schemas (Books & School DBs) or take real practice CBT tests.
2. **IT Passport & SG Exam Dojo**: Prep for Japanese Information Technology exams using past exams (R3-R8) with translation support.
3. **Multilingual Study Content**: Static translations covering SQL, IT Passport, SG, Java, and Python in:
   - **English** (en-US)
   - **Vietnamese** (vi-VN)
   - **Burmese** (my-MM)
   - **French** (fr-FR)
   - *Fallback to original Japanese / Chinese for ja-JP, zh-CN, and default-ja-zh.*
4. **IT Glossary**: Quick modal popup featuring 30 core IT Passport and SG exam definitions with translation packages.
5. **IME Typing Dojo**: Practice typing Japanese technical definitions with system-wide IME matching.

---

## 🛠️ Developer & Self-Hosting Guide

This project is built using pure Vanilla JS, CSS, and HTML5. No bundlers or Node.js build processes are required.

To run locally:
```bash
# Start a simple static server
npm run dev
```

To deploy on Cloudflare Pages:
1. Fork or clone this repository.
2. Deploy the directory directly onto Cloudflare Pages.
3. (Optional) Configure Piston API execution endpoint via `functions/api/execute.js` environment variables.
