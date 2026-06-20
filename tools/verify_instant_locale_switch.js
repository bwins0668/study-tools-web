#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://127.0.0.1:5173";

let failures = 0;

async function run() {
  console.log("=== Running Instant Locale Switch and State retention Test ===");
  console.log(`Target URL: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  // Load page and wait for init
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.I18n && typeof window.I18n.setLanguage === "function", null, { timeout: 10000 });

  // Get eligible locales
  const eligibleLocales = await page.evaluate(() => {
    return window.LOCALE_REGISTRY.getEligible().map(l => l.code);
  });

  console.log("Locales to test instant switch:", eligibleLocales);

  // Monitor network requests
  let networkRequestsCount = 0;
  const requests = [];
  page.on("request", (request) => {
    const url = request.url();
    const type = request.resourceType();
    // Ignore internal page assets loads if any, but for language switch, fetch/xhr should be zero
    if (type === "fetch" || type === "xhr" || type === "websocket") {
      // Ignore local live-server ws protocol
      if (url.includes("ws://") || url.includes("live-server") || url.includes("hot-reload")) {
        return;
      }
      console.log(`  ⚠️ Network request intercepted during switch: [${type}] ${url}`);
      networkRequestsCount++;
      requests.push({ type, url });
    }
  });

  // Switch to SQL first and type something in sandbox as state
  await page.evaluate(() => {
    window.switchSubject("sql");
  });
  await page.waitForTimeout(300);

  // Type code in editor
  const editorSelector = "#sql-editor";
  const testCode = "SELECT * FROM students_mst WHERE grade = 3;";
  await page.fill(editorSelector, testCode);
  
  // Set stdin
  const stdinSelector = "#sandbox-stdin-input";
  const testStdin = "TEST_STDIN_123";
  const hasStdin = await page.evaluate((sel) => !!document.querySelector(sel), stdinSelector);
  if (hasStdin) {
    await page.fill(stdinSelector, testStdin);
  }

  // Get current active lesson ID
  const initialLessonId = await page.evaluate(() => {
    return typeof currentLessonId !== "undefined" ? currentLessonId : null;
  });

  for (const locale of eligibleLocales) {
    console.log(`\n--- Test switches for: "${locale}" ---`);

    // Reset request count before switch
    networkRequestsCount = 0;
    requests.length = 0;

    // Time language switch
    const t0 = Date.now();
    await page.evaluate(async (l) => {
      await window.I18n.setLanguage(l);
    }, locale);
    const duration = Date.now() - t0;

    console.log(`  Language Switch latency: ${duration}ms`);
    if (duration > 1000) {
      console.log(`  ❌ FAIL: Language switch latency exceeds 1000ms: ${duration}ms`);
      failures++;
    }

    if (networkRequestsCount > 0) {
      console.log(`  ❌ FAIL: Language switch triggered ${networkRequestsCount} network requests:`, requests);
      failures++;
    }

    // Verify State Retention
    const currentSubject = await page.evaluate(() => {
      return typeof currentSubject !== "undefined" ? currentSubject : null;
    });
    const currentLesson = await page.evaluate(() => {
      return typeof currentLessonId !== "undefined" ? currentLessonId : null;
    });
    const editorVal = await page.inputValue(editorSelector);
    
    let stdinVal = "";
    if (hasStdin) {
      stdinVal = await page.inputValue(stdinSelector);
    }

    if (currentSubject !== "sql") {
      console.log(`  ❌ FAIL: Subject state lost. Expected "sql", got "${currentSubject}"`);
      failures++;
    }
    if (currentLesson !== initialLessonId) {
      console.log(`  ❌ FAIL: Lesson state lost. Expected "${initialLessonId}", got "${currentLesson}"`);
      failures++;
    }
    if (editorVal !== testCode) {
      console.log(`  ❌ FAIL: Editor code state lost. Expected "${testCode}", got "${editorVal}"`);
      failures++;
    }
    if (hasStdin && stdinVal !== testStdin) {
      console.log(`  ❌ FAIL: Stdin state lost. Expected "${testStdin}", got "${stdinVal}"`);
      failures++;
    }

    // If compare eligible, test mode switch
    const compareEligible = await page.evaluate((l) => {
      return window.DisplayMode && typeof window.DisplayMode.isCompareEligible === "function" && window.DisplayMode.isCompareEligible(l);
    }, locale);

    if (compareEligible) {
      console.log("  Testing mode switch (target-only <-> ja-compare)...");

      // Switch to ja-compare
      networkRequestsCount = 0;
      requests.length = 0;
      
      const m0 = Date.now();
      await page.evaluate(() => {
        window.DisplayMode.set("ja-compare");
        if (typeof window.refreshI18nForCurrentLesson === "function") {
          window.refreshI18nForCurrentLesson();
        }
      });
      const modeDuration1 = Date.now() - m0;
      
      console.log(`    Mode Switch to ja-compare latency: ${modeDuration1}ms`);
      if (modeDuration1 > 500) {
        console.log(`    ❌ FAIL: Mode switch latency exceeds 500ms: ${modeDuration1}ms`);
        failures++;
      }
      if (networkRequestsCount > 0) {
        console.log(`    ❌ FAIL: Mode switch triggered ${networkRequestsCount} network requests:`, requests);
        failures++;
      }

      // Switch back to target-only
      networkRequestsCount = 0;
      requests.length = 0;
      
      const m1 = Date.now();
      await page.evaluate(() => {
        window.DisplayMode.set("target-only");
        if (typeof window.refreshI18nForCurrentLesson === "function") {
          window.refreshI18nForCurrentLesson();
        }
      });
      const modeDuration2 = Date.now() - m1;

      console.log(`    Mode Switch to target-only latency: ${modeDuration2}ms`);
      if (modeDuration2 > 500) {
        console.log(`    ❌ FAIL: Mode switch latency exceeds 500ms: ${modeDuration2}ms`);
        failures++;
      }
      if (networkRequestsCount > 0) {
        console.log(`    ❌ FAIL: Mode switch triggered ${networkRequestsCount} network requests:`, requests);
        failures++;
      }
    }
  }

  await browser.close();

  console.log(`\nInstant Switch Test Finished: ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
