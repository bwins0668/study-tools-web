/**
 * verify_sql_ko_content_complete.js
 *
 * Validates that all 36 SQL lessons have complete Korean (ko) content
 * in both data/lessons.js (locales.ko) and data/i18n_content/sql_ko.js (ContentI18n).
 *
 * Usage:
 *   node tools/verify_sql_ko_content_complete.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const LESSONS_PATH = path.join(ROOT, "data", "lessons.js");
const SQL_KO_PATH = path.join(ROOT, "data", "i18n_content", "sql_ko.js");
const INDEX_PATH = path.join(ROOT, "index.html");
const VERSION_PATH = path.join(ROOT, "assets", "js", "version.js");
const SW_PATH = path.join(ROOT, "service-worker.js");
const MANIFEST_I18N_PATH = path.join(ROOT, "data", "i18n_content", "manifest.json");

let failCount = 0;
let passCount = 0;
let warnCount = 0;

function pass(label, detail) {
  passCount++;
  console.log(`  PASS  ${label}${detail ? " — " + detail : ""}`);
}

function fail(label, detail) {
  failCount++;
  console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
}

function warn(label, detail) {
  warnCount++;
  console.log(`  WARN  ${label}${detail ? " — " + detail : ""}`);
}

function hasHangul(text) {
  return /[\uac00-\ud7af]/.test(text || "");
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text || "");
}

function assertNoKoreanFallbackToChinese(text, label) {
  const forbidden = [
    "中文（简体）(fallback)",
    "中文(简体)(fallback)",
    "中文 fallback",
    "数据表中",
    "数据类型",
    "主键",
    "关系型数据库",
    "数据库（Database",
  ];
  const hit = forbidden.find((word) => (text || "").includes(word));
  if (hit) {
    fail(label, `Korean mode falls back to Chinese: "${hit}"`);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// 1. Load SQL_LESSONS from data/lessons.js
// ─────────────────────────────────────────────────────────
console.log("\n=== 1. Load SQL_LESSONS ===");

const lessonsSrc = fs.readFileSync(LESSONS_PATH, "utf8");
// Replace const with var so it becomes accessible in the vm sandbox
const lessonsCode = lessonsSrc.replace(
  /^const\s+SQL_LESSONS\s*=/m,
  "var SQL_LESSONS ="
);

const sandbox = {
  console,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  parseInt,
  parseFloat,
  Date,
  RegExp,
  Error,
  TypeError,
  RangeError,
};
vm.createContext(sandbox);
vm.runInContext(lessonsCode, sandbox);
const SQL_LESSONS = sandbox.SQL_LESSONS;

if (!SQL_LESSONS || !Array.isArray(SQL_LESSONS)) {
  fail("SQL_LESSONS", "Failed to load SQL_LESSONS array");
  console.error("Cannot proceed without SQL_LESSONS data.");
  process.exit(1);
}

pass("SQL_LESSONS loaded", `${SQL_LESSONS.length} lessons`);

if (SQL_LESSONS.length !== 36) {
  fail("Lesson count", `Expected 36, got ${SQL_LESSONS.length}`);
} else {
  pass("Lesson count", "36");
}

// ─────────────────────────────────────────────────────────
// 2. Check each lesson has ko content in locales
// ─────────────────────────────────────────────────────────
console.log("\n=== 2. Lessons locales.ko completeness ===");

let lessonsWithKoTitle = 0;
let lessonsWithKoConcept = 0;
let lessonsWithHangulTitle = 0;
let lessonsWithHangulConcept = 0;
let lessonsNoChineseFallback = 0;

for (const lesson of SQL_LESSONS) {
  const id = lesson.id;
  const locales = lesson.locales;
  const label = `Lesson ${String(id).padStart(2, "0")}`;

  if (!locales) {
    fail(label, "No locales object");
    continue;
  }

  // Check title
  const titleKo = locales.title && locales.title.ko;
  if (titleKo) {
    lessonsWithKoTitle++;
    if (hasHangul(titleKo)) {
      lessonsWithHangulTitle++;
    } else {
      fail(`${label} title`, "ko title has no Hangul");
    }
    if (assertNoKoreanFallbackToChinese(titleKo, `${label} title`)) {
      // ok
    }
  } else {
    fail(`${label} title`, "Missing locales.title.ko");
  }

  // Check concept
  const conceptKo = locales.concept && locales.concept.ko;
  if (conceptKo) {
    lessonsWithKoConcept++;
    if (hasHangul(conceptKo)) {
      lessonsWithHangulConcept++;
    } else {
      fail(`${label} concept`, "ko concept has no Hangul");
    }
    if (assertNoKoreanFallbackToChinese(conceptKo, `${label} concept`)) {
      // ok
    }
  } else {
    fail(`${label} concept`, "Missing locales.concept.ko");
  }

  // Check no Chinese residue in ko fields
  if (titleKo && hasChinese(titleKo)) {
    warn(`${label} title`, "ko title contains Chinese characters");
  }
  if (conceptKo && hasChinese(conceptKo)) {
    warn(`${label} concept`, "ko concept contains Chinese characters");
  }

  lessonsNoChineseFallback++;
}

console.log(`\n  Summary:`);
console.log(`    ko title present: ${lessonsWithKoTitle}/36`);
console.log(`    ko title has Hangul: ${lessonsWithHangulTitle}/36`);
console.log(`    ko concept present: ${lessonsWithKoConcept}/36`);
console.log(`    ko concept has Hangul: ${lessonsWithHangulConcept}/36`);

if (lessonsWithKoTitle === 36) pass("All 36 lessons have ko title");
else fail("ko title coverage", `${lessonsWithKoTitle}/36`);

if (lessonsWithKoConcept === 36) pass("All 36 lessons have ko concept");
else fail("ko concept coverage", `${lessonsWithKoConcept}/36`);

if (lessonsWithHangulTitle === 36) pass("All 36 ko titles contain Hangul");
else fail("Hangul in ko titles", `${lessonsWithHangulTitle}/36`);

if (lessonsWithHangulConcept === 36) pass("All 36 ko concepts contain Hangul");
else fail("Hangul in ko concepts", `${lessonsWithHangulConcept}/36`);

// ─────────────────────────────────────────────────────────
// 3. Check ContentI18n sql_ko.js
// ─────────────────────────────────────────────────────────
console.log("\n=== 3. ContentI18n sql_ko.js ===");

const sqlKoSrc = fs.readFileSync(SQL_KO_PATH, "utf8");
// Replace window.CONTENT_I18N with a sandbox-local variable
const sqlKoCode = "var CONTENT_I18N = CONTENT_I18N || {};\n" +
  sqlKoSrc.replace(/window\.CONTENT_I18N/g, "CONTENT_I18N");

const sandbox2 = { console, JSON, Object, String, Array };
vm.createContext(sandbox2);
vm.runInContext(sqlKoCode, sandbox2);
const CONTENT_I18N = sandbox2.CONTENT_I18N || {};

let i18nKoCount = 0;
let i18nKoHangulCount = 0;
for (let i = 1; i <= 36; i++) {
  const key = `sql:${i}`;
  const entry = CONTENT_I18N[key];
  const label = `I18N ${key}`;

  if (!entry || !entry.ko) {
    fail(label, "Missing ko entry");
    continue;
  }

  i18nKoCount++;
  const concept = entry.ko.concept || "";
  if (hasHangul(concept)) {
    i18nKoHangulCount++;
  } else {
    fail(label, "ko concept has no Hangul");
  }

  assertNoKoreanFallbackToChinese(concept, label);
}

if (i18nKoCount === 36) pass("ContentI18n sql_ko has 36 entries");
else fail("ContentI18n sql_ko coverage", `${i18nKoCount}/36`);

if (i18nKoHangulCount === 36) pass("All ContentI18n ko entries have Hangul");
else fail("ContentI18n Hangul", `${i18nKoHangulCount}/36`);

// ─────────────────────────────────────────────────────────
// 4. Check index.html references sql_ko.js
// ─────────────────────────────────────────────────────────
console.log("\n=== 4. index.html references ===");

const indexHtml = fs.readFileSync(INDEX_PATH, "utf8");

if (indexHtml.includes("sql_ko.js")) {
  pass("index.html includes sql_ko.js");
} else {
  fail("index.html", "Missing sql_ko.js script reference");
}

// ─────────────────────────────────────────────────────────
// 5. Check version consistency
// ─────────────────────────────────────────────────────────
const versionSrc = fs.readFileSync(VERSION_PATH, "utf8");
const versionMatch = versionSrc.match(/webVersion:\s*"([^"]+)"/);
const EXPECTED_VERSION = versionMatch ? versionMatch[1] : "";

console.log("\n=== 5. Version consistency ===");

if (EXPECTED_VERSION && versionSrc.includes(EXPECTED_VERSION)) {
  pass("version.js", EXPECTED_VERSION);
} else {
  fail("version.js", "Could not read current webVersion");
}

const swSrc = fs.readFileSync(SW_PATH, "utf8");
if (swSrc.includes(EXPECTED_VERSION)) {
  pass("service-worker.js", EXPECTED_VERSION);
} else {
  fail("service-worker.js", `Does not contain ${EXPECTED_VERSION}`);
}

if (indexHtml.includes(EXPECTED_VERSION)) {
  pass("index.html cache-buster", EXPECTED_VERSION);
} else {
  fail("index.html cache-buster", `Does not contain ${EXPECTED_VERSION}`);
}

// Check no old version remains
const OLD_VERSION = "v2026.6.19-r-offline-i18n";
const oldVersionFiles = [
  { name: "index.html", content: indexHtml },
  { name: "version.js", content: versionSrc },
  { name: "service-worker.js", content: swSrc },
];

for (const f of oldVersionFiles) {
  if (f.content.includes(OLD_VERSION)) {
    fail(`${f.name}`, `Still contains old version ${OLD_VERSION}`);
  }
}

// ─────────────────────────────────────────────────────────
// 6. Check manifest.json has sql_ko entry
// ─────────────────────────────────────────────────────────
console.log("\n=== 6. i18n_content/manifest.json ===");

const manifestSrc = fs.readFileSync(MANIFEST_I18N_PATH, "utf8");
const manifest = JSON.parse(manifestSrc);

const sqlKoPack = manifest.packs.find(
  (p) => p.subject === "sql" && p.lang === "ko"
);

if (sqlKoPack) {
  pass("manifest.json has sql:ko pack", `${sqlKoPack.lessonCount} lessons`);
} else {
  fail("manifest.json", "Missing sql:ko pack entry");
}

if (manifest.totalPacks >= 21) {
  pass("totalPacks", `${manifest.totalPacks}`);
} else {
  fail("totalPacks", `Expected >=21, got ${manifest.totalPacks}`);
}

if (manifest.totalLanguages >= 5) {
  pass("totalLanguages", `${manifest.totalLanguages}`);
} else {
  fail("totalLanguages", `Expected >=5, got ${manifest.totalLanguages}`);
}

// ─────────────────────────────────────────────────────────
// 7. Check no translation API patterns in lessons data
// ─────────────────────────────────────────────────────────
console.log("\n=== 7. No translation API patterns ===");

const suspiciousPatterns = [
  /undefined/i,
  /\[object Object\]/,
  /翻訳中/,
  /翻译中/,
  /Translating\b/i,
];

let suspiciousFound = false;
for (const lesson of SQL_LESSONS) {
  const ko = lesson.locales;
  if (!ko) continue;
  const titleKo = (ko.title && ko.title.ko) || "";
  const conceptKo = (ko.concept && ko.concept.ko) || "";
  const combined = titleKo + conceptKo;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combined)) {
      fail(`Lesson ${lesson.id}`, `Suspicious pattern: ${pattern}`);
      suspiciousFound = true;
    }
  }
}

if (!suspiciousFound) {
  pass("No suspicious patterns", "undefined/raw key/translation pending");
}

// ─────────────────────────────────────────────────────────
// Final report
// ─────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(50));
console.log(`SQL Korean Content Complete Report`);
console.log(`  PASS: ${passCount}`);
console.log(`  FAIL: ${failCount}`);
console.log(`  WARN: ${warnCount}`);
console.log("=".repeat(50));

if (failCount > 0) {
  console.log("\nRESULT: FAIL");
  process.exit(1);
} else {
  console.log("\nRESULT: PASS");
  process.exit(0);
}
