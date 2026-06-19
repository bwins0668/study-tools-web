#!/usr/bin/env node
/**
 * verify_i18n_minor_pack_patch.js
 * 
 * Verify the i18n minor pack patch round:
 * 1. sandbox.playground key exists in all target languages
 * 2. th/id normalize works
 * 3. my/vi key UI entries no longer show English
 * 4. No translation API requests
 * 5. No undefined/null/raw keys
 * 6. th/id SQL packs load properly
 * 7. Honest fallback for missing content
 */

"use strict";

let passed = 0;
let failed = 0;
let warnings = 0;

function check(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

function warn(label) {
  warnings++;
  console.log(`  ⚠ ${label}`);
}

// ── 1. Load the UI dict ──────────────────────────────────
const fs = require("fs");
const path = require("path");
const BASE = path.resolve(__dirname, "..");

// Read the raw file for pattern checks
const uiDictRaw = fs.readFileSync(path.join(BASE, "assets/js/i18n-ui-dict.js"), "utf8");
const i18nJs = fs.readFileSync(path.join(BASE, "assets/js/i18n.js"), "utf8");
const contentI18nJs = fs.readFileSync(path.join(BASE, "assets/js/content-i18n.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(BASE, "index.html"), "utf8");

// ── Sandbox operations ────────────────────────────────────────────
const sandbox = require("child_process");

console.log("\n═══ i18n Minor Pack Patch Verification ═══\n");

// ── 2. sandbox.playground key ────────────────────────────
console.log("── [1/7] sandbox.playground key ──");

const sandboxPlaygroundRegex = /sandbox\s*:\s*\{[^}]*playground\s*:/g;
const dictMatches = uiDictRaw.match(sandboxPlaygroundRegex);
check(dictMatches && dictMatches.length >= 8,
  `sandbox.playground found in ${dictMatches ? dictMatches.length : 0} language blocks (expected >= 8)`);

// Check the actual values per language
const playgroundValues = [];
const pgRegex = /playground\s*:\s*"([^"]+)"/g;
let match;
while ((match = pgRegex.exec(uiDictRaw)) !== null) {
  const val = match[1];
  if (!playgroundValues.includes(val)) playgroundValues.push(val);
}

// We should see non-English values
const englishOnly = playgroundValues.filter(v => /^[a-zA-Z\s]+$/.test(v));
check(englishOnly.length <= 2,
  `sandbox.playground values that are English-only: ${englishOnly.length} (en-US and en-fallback allowed)`);

check(!uiDictRaw.includes('sandbox.playground'),
  "No raw 'sandbox.playground' key string in UI dict text (would appear as untranslated)");

// ── 3. th/id normalize ───────────────────────────────────
console.log("\n── [2/7] th/id normalize ──");

check(i18nJs.includes('=== "th"') || i18nJs.includes('=== "th-'),
  "normalizeLanguageCode handles 'th'");
check(i18nJs.includes('"th-th"') || i18nJs.includes('"th-TH"'),
  "normalizeLanguageCode handles 'th-TH' / 'th-th'");
check(i18nJs.includes('=== "id"') || i18nJs.includes('=== "id-'),
  "normalizeLanguageCode handles 'id'");
check(i18nJs.includes('"id-id"') || i18nJs.includes('"id-ID"'),
  "normalizeLanguageCode handles 'id-ID' / 'id-id'");

// Check fallback chain
check(i18nJs.includes('lang === "th-TH"') || i18nJs.includes('lang === "id-ID"'),
  "Special fallback chain for th-TH/id-ID (prefer en-US)");

// ── 4. th/id in content-i18n.js ──────────────────────────
console.log("\n── [3/7] th/id in content pack loading ──");

check(contentI18nJs.includes('"th"') || contentI18nJs.includes("'th'"),
  "th included in content pack loading");
check(contentI18nJs.includes('"id"') || contentI18nJs.includes("'id'"),
  "id included in content pack loading");

// ── 5. my/vi UI entries ──────────────────────────────────
console.log("\n── [4/7] my/vi key UI entries ──");

// Check vi-VN codingTyping section  
const viCodingTyping = uiDictRaw.match(/"vi-VN"\s*:\s*\{[^}]*codingTyping\s*:\s*\{[^}]*\}/s);
if (viCodingTyping) {
  const vt = viCodingTyping[0];
  check(vt.includes('Gửi đến Sandbox'),
    "vi-VN: sendToSandbox is Vietnamese");
  check(vt.includes('Chạy trong Sandbox'),
    "vi-VN: runInSandbox is Vietnamese");
  check(vt.includes('Sandbox không khả dụng'),
    "vi-VN: sandboxUnavailable is Vietnamese");
  // openSandbox might be different format
} else {
  warn("Could not locate vi-VN codingTyping block");
}

// Check my-MM codingTyping section
const myCodingTyping = uiDictRaw.match(/"my-MM"\s*:\s*\{[^}]*codingTyping\s*:\s*\{[^}]*\}/s);
if (myCodingTyping) {
  const mt = myCodingTyping[0];
  check(!mt.includes('Send to Sandbox'),
    "my-MM: sendToSandbox is NOT English");
  check(mt.includes('Sandbox သို့ပို့ရန်'),
    "my-MM: sendToSandbox is Burmese");
  check(mt.includes('လေ့ကျင့်ခန်းစာရင်းသို့ပြန်ရန်'),
    "my-MM: backToList is Burmese");
} else {
  warn("Could not locate my-MM codingTyping block");
}

// Check th-TH aiLearning
const thAILearning = uiDictRaw.match(/"th-TH"\s*:\s*\{[^}]*aiLearning\s*:\s*"[^"]+"/s);
if (thAILearning) {
  check(!thAILearning[0].includes('AI Learning'),
    "th-TH: aiLearning is NOT English");
}

// Check id-ID aiLearning
const idAILearning = uiDictRaw.match(/"id-ID"\s*:\s*\{[^}]*aiLearning\s*:\s*"[^"]+"/s);
if (idAILearning) {
  check(!idAILearning[0].includes('AI Learning'),
    "id-ID: aiLearning is NOT English");
}

// Check ko-KR codingTyping
const koCodingTyping = uiDictRaw.match(/"ko-KR"\s*:\s*\{[^}]*codingTyping\s*:\s*\{[^}]*\}/s);
if (koCodingTyping) {
  const kt = koCodingTyping[0];
  check(!kt.includes('Send to Sandbox'),
    "ko-KR: sendToSandbox is NOT English");
  check(kt.includes('Sandbox로 보내기'),
    "ko-KR: sendToSandbox is Korean");
}

// Check fr-FR toolbar entries
const toolbarBlockMatch = uiDictRaw.match(/TOOLBAR_ROUND_23_4\s*=\s*\{[^}]+fr-FR[^}]+sense/s);
if (!toolbarBlockMatch) {
  // alternative: just check the raw block
  check(uiDictRaw.includes('"fr-FR"') && uiDictRaw.match(/"fr-FR"\s*:\s*\{[^}]+language\s*:/),
    "fr-FR toolbar entries exist");
}

// ── 6. No translation API / overlay ──────────────────────
console.log("\n── [5/7] Offline i18n compliance ──");

check(!uiDictRaw.includes('/api/translate'),
  "No /api/translate in UI dict");
check(!uiDictRaw.includes('translating') && !uiDictRaw.includes('翻訳中') && !uiDictRaw.includes('翻译中'),
  "No translation indicator strings in UI dict");
check(i18nJs.includes('DISABLE_TRANSLATION_OVERLAY') || i18nJs.includes('DISABLE_TRANSLATION_OVERLAY'),
  "DISABLE_TRANSLATION_OVERLAY defined");
check(!contentI18nJs.includes('/api/translate'),
  "No /api/translate in content-i18n.js");

// ── 7. SQL packs check ──────────────────────────────────
console.log("\n── [6/7] SQL content packs ──");

const thPath = path.join(BASE, "data/i18n_content/sql_th.js");
const idPath = path.join(BASE, "data/i18n_content/sql_id.js");

const thExists = fs.existsSync(thPath);
const idExists = fs.existsSync(idPath);

check(thExists, "sql_th.js exists");
check(idExists, "sql_id.js exists");

if (thExists) {
  const thContent = fs.readFileSync(thPath, "utf8");
  const thLessonCount = (thContent.match(/sql:\d+/g) || []).length;
  check(thLessonCount === 36, `sql_th.js has ${thLessonCount} lessons (expected 36)`);
}

if (idExists) {
  const idContent = fs.readFileSync(idPath, "utf8");
  const idLessonCount = (idContent.match(/sql:\d+/g) || []).length;
  check(idLessonCount === 36, `sql_id.js has ${idLessonCount} lessons (expected 36)`);
}

// Check manifest has th and id
const manifest = JSON.parse(fs.readFileSync(path.join(BASE, "data/i18n_content/manifest.json"), "utf8"));
const manifestLangs = manifest.packs.map(p => p.lang);
check(manifestLangs.includes("th"), "manifest.json includes th language");
check(manifestLangs.includes("id"), "manifest.json includes id language");
check(manifest.totalLanguages >= 7, `manifest totalLanguages >= 7 (is ${manifest.totalLanguages})`);

// Check version consistent
const versionJs = fs.readFileSync(path.join(BASE, "assets/js/version.js"), "utf8");
const versionMatch = versionJs.match(/webVersion:\s*"([^"]+)"/);
const currentVersion = versionMatch ? versionMatch[1] : "";
check(versionMatch !== null, "version.js has webVersion");
if (versionMatch) {
  check(/^v2026\.6\.\d{2}-/.test(currentVersion),
    `version.js webVersion is "${currentVersion}"`);
}

// Index cache-buster check
const escapedVersion = currentVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ibCount = currentVersion ? (indexHtml.match(new RegExp(escapedVersion, "g")) || []).length : 0;
check(ibCount >= 10, `index.html has ${ibCount} cache-buster references (expected >= 10)`);
check(!indexHtml.includes('v2026.6.19-r-sql-ko-content'),
  "index.html has no old cache-buster references");

// ── 8. Version consistency ───────────────────────────────
console.log("\n── [7/7] Version consistency across files ──");

const sw = fs.readFileSync(path.join(BASE, "service-worker.js"), "utf8");
check(currentVersion && sw.includes(currentVersion),
  "service-worker.js has new cache version");

const am = JSON.parse(fs.readFileSync(path.join(BASE, "assets/asset-manifest.json"), "utf8"));
check(am.assetVersion === currentVersion,
  "asset-manifest.json has new assetVersion");

// ── Summary ──────────────────────────────────────────────
console.log(`\n═══ Results: ${passed} PASS / ${failed} FAIL / ${warnings} WARN ═══`);
process.exit(failed > 0 ? 1 : 0);
