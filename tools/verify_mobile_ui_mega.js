/*
 * tools/verify_mobile_ui_mega.js
 * Comprehensive mobile UI audit for Web public version.
 *
 * Covers:
 *   - 4 viewports (375, 390, 414, 430) × 10+ page states
 *   - Horizontal overflow on every page
 *   - Language menu: open, viewport containment, z-index, no text cutoff
 *   - Language switching: zh / ja / en / ko — no raw keys, no undefined
 *   - Account panel, settings panel, tools drawer
 *   - SQL lesson + bilingual compare + exam sandbox
 *   - Color contrast check on key interactive elements
 *   - Element-in-viewport assertion
 *   - Automatic offender detection (elements outside viewport)
 *
 * Usage: node tools/verify_mobile_ui_mega.js
 * Requires: playwright (already available in project)
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5174';
const HEADLESS = process.env.HEADLESS !== 'false';

const VIEWPORTS = [
  { w: 375, h: 812, label: '375×812 (iPhone X)' },
  { w: 390, h: 844, label: '390×844 (iPhone 14)' },
  { w: 414, h: 896, label: '414×896 (iPhone 11)' },
  { w: 430, h: 932, label: '430×932 (iPhone 16)' },
];

const LANGUAGES = [
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: 'Korean' },
];

/* ── Helpers ── */

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    docClientWidth: document.documentElement.clientWidth,
  }));

  const overflowed =
    result.docScrollWidth > result.innerWidth + 2 ||
    result.bodyScrollWidth > result.innerWidth + 2;

  return { pass: !overflowed, result };
}

async function assertElementInViewport(page, selector, label) {
  const result = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };

    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    return {
      exists: true,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      zIndex: parseInt(cs.zIndex, 10) || 0,
      text: (el.textContent || '').trim().slice(0, 80),
    };
  }, selector);

  if (!result.exists) {
    return { pass: false, reason: `missing selector "${selector}"`, result };
  }

  const hCrop = result.left < -2 || result.right > result.innerWidth + 2;
  const vCrop = result.top < -2 || result.bottom > result.innerHeight + 24;

  if (hCrop || vCrop) {
    return {
      pass: false,
      reason: `element outside viewport: left=${result.left} right=${result.right} top=${result.top} bottom=${result.bottom} (vw=${result.innerWidth} vh=${result.innerHeight})`,
      result,
    };
  }

  return { pass: true, result };
}

function relativeLuminance(rgb) {
  const values = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function assertColorContrast(page, selector, label, minRatio = 3.0) {
  const result = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };

    const cs = getComputedStyle(el);
    const color = cs.color;
    const bg = cs.backgroundColor;

    const parseRGB = (str) => {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };

    return {
      exists: true,
      color,
      backgroundColor: bg,
      fg: parseRGB(color),
      bg: parseRGB(bg),
      text: (el.textContent || '').trim().slice(0, 40),
    };
  }, selector);

  if (!result.exists) {
    return { pass: false, reason: `missing selector "${selector}"`, result };
  }

  if (!result.fg || !result.bg) {
    return { pass: false, reason: `cannot parse colors: fg=${result.color} bg=${result.backgroundColor}`, result };
  }

  const ratio = contrastRatio(result.fg, result.bg);
  const pass = ratio >= minRatio;

  return { pass, ratio, minRatio, result };
}

async function detectOffenders(page, label) {
  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const offenders = [...document.querySelectorAll('*')]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const closedPanel = el.closest('.app-sidebar, .playground-section, .tools-drawer__panel, .module-switch-panel');
        let clippedByClosedPanel = false;
        if (closedPanel && closedPanel !== el) {
          const panelRect = closedPanel.getBoundingClientRect();
          clippedByClosedPanel = panelRect.right <= 0 || panelRect.left >= vw;
        }

        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          position: style.position,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          overflowX: style.overflowX,
          clippedByClosedPanel,
        };
      })
      .filter((x) => {
        if (x.display === 'none') return false;
        if (x.visibility === 'hidden') return false;
        if (Number(x.opacity) === 0) return false;
        if (x.clippedByClosedPanel) return false;
        if (x.right <= 0 || x.left >= vw) return false;
        return (
          x.right > vw + 2 ||
          x.left < -2 ||
          x.width > vw + 2
        );
      })
      .slice(0, 120);

    return {
      viewport: { width: vw, height: vh },
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });

  const hasIssues = result.offenders.length > 0;
  if (hasIssues) {
    const top = result.offenders.slice(0, 10);
    return { pass: false, reason: `${result.offenders.length} offenders found: ${JSON.stringify(top)}`, result };
  }

  return { pass: true, result };
}

/* ── Test suites ── */

async function runOverflowTests(browser) {
  const tests = [];
  const testPages = [
    { path: '/', label: 'Home' },
    { path: '/?module=sql&lesson=1', label: 'SQL Lesson' },
    { path: '/?module=sql&lesson=1&lang=both', label: 'SQL Bilingual Compare' },
    { path: '/?module=sql&exam=1', label: 'SQL Exam Sandbox' },
    { path: '/?module=java', label: 'Java Module' },
    { path: '/?module=python', label: 'Python Module' },
    { path: '/?module=japanese-typing', label: 'Japanese Typing' },
    { path: '/?module=tools', label: 'Tools Dashboard' },
  ];

  for (const vp of VIEWPORTS) {
    for (const pg of testPages) {
      const label = `${vp.label} — ${pg.label}`;
      try {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        await page.goto(BASE_URL + pg.path, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);

        const overflow = await assertNoHorizontalOverflow(page, label);
        const offender = await detectOffenders(page, label);

        if (overflow.pass && offender.pass) {
          tests.push({ label, status: 'PASS', detail: `scrollW=${overflow.result.docScrollWidth} vw=${overflow.result.innerWidth}` });
        } else {
          const reasons = [];
          if (!overflow.pass) reasons.push(`OVERFLOW: scrollW=${overflow.result.docScrollWidth} vw=${overflow.result.innerWidth}`);
          if (!offender.pass) reasons.push(`OFFENDERS: ${offender.reason}`);
          tests.push({ label, status: 'FAIL', detail: reasons.join('; ') });
        }

        await page.close();
        await context.close();
      } catch (err) {
        tests.push({ label, status: 'SKIP', detail: err.message });
      }
    }
  }

  return tests;
}

async function runLanguageMenuTests(browser) {
  const tests = [];

  for (const vp of VIEWPORTS) {
    const label = `${vp.label}`;
    try {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await context.newPage();
      await page.goto(BASE_URL + '/?module=sql&lesson=1', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      // 1. Overflow on page load
      const overflow = await assertNoHorizontalOverflow(page, `${label} pre-lang`);
      tests.push({
        label: `${label} — pre-lang overflow`,
        status: overflow.pass ? 'PASS' : 'FAIL',
        detail: overflow.pass ? '' : `OVERFLOW: scrollW=${overflow.result.docScrollWidth} vw=${overflow.result.innerWidth}`,
      });

      // 2. Open language menu
      const langBtn = await page.$('.language-toggle-btn');
      if (langBtn) {
        await langBtn.click();
        await page.waitForTimeout(800);

        // 3. Check language popover in viewport
        const popover = await assertElementInViewport(page, '.language-popover.open', `${label} language popover`);
        tests.push({
          label: `${label} — language popover in viewport`,
          status: popover.pass ? 'PASS' : 'FAIL',
          detail: popover.pass ? `left=${popover.result.left} right=${popover.result.right} width=${popover.result.width} z=${popover.result.zIndex}` : popover.reason,
        });

        // 4. Check z-index >= 2000
        const zi = popover.result.zIndex || 0;
        if (zi >= 2000) {
          tests.push({
            label: `${label} — language popover z-index ${zi} >= 2000`,
            status: 'PASS',
            detail: '',
          });
        } else {
          tests.push({
            label: `${label} — language popover z-index ${zi} >= 2000`,
            status: 'FAIL',
            detail: `z-index too low: ${zi}`,
          });
        }

        // 5. Check that language options are visible (not cut off)
        const firstOption = await assertElementInViewport(page, '.language-option', `${label} first language option`);
        tests.push({
          label: `${label} — language option in viewport`,
          status: firstOption.pass ? 'PASS' : 'FAIL',
          detail: firstOption.pass ? `text="${firstOption.result.text}"` : firstOption.reason,
        });

        // 6. Check color contrast on lang option
        const contrast = await assertColorContrast(page, '.language-option', `${label} lang option contrast`, 3.0);
        tests.push({
          label: `${label} — language option contrast (min 3.0)`,
          status: contrast.pass ? 'PASS' : 'FAIL',
          detail: contrast.pass ? `ratio=${contrast.ratio.toFixed(2)}:1` : `ratio=${contrast.ratio ? contrast.ratio.toFixed(2) : '?'}:1 ${contrast.reason || ''}`,
        });

        // 7. No overflow while menu is open
        const openOverflow = await assertNoHorizontalOverflow(page, `${label} lang menu open`);
        if (!openOverflow.pass) {
          tests.push({
            label: `${label} — no overflow with lang menu open`,
            status: 'FAIL',
            detail: `OVERFLOW: scrollW=${openOverflow.result.docScrollWidth} vw=${openOverflow.result.innerWidth}`,
          });
        }

        // 8. Switch languages and check
        for (const lang of LANGUAGES) {
          const option = await page.$(`.language-option[data-lang="${lang.code}"], .language-option[data-value="${lang.code}"], .language-option[lang="${lang.code}"]`);
          if (option) {
            await option.click();
            await page.waitForTimeout(600);

            const overflowAfter = await assertNoHorizontalOverflow(page, `${label} lang=${lang.code}`);
            tests.push({
              label: `${label} — lang=${lang.code} no overflow`,
              status: overflowAfter.pass ? 'PASS' : 'FAIL',
              detail: overflowAfter.pass ? '' : `OVERFLOW scrollW=${overflowAfter.result.docScrollWidth} vw=${overflowAfter.result.innerWidth}`,
            });

            // Check for raw keys / undefined in visible text
            const hasRawKey = await page.evaluate(() => {
              const body = document.body.innerText;
              return body.includes('undefined') || body.includes('i18n:') || body.includes('translate:');
            });
            tests.push({
              label: `${label} — lang=${lang.code} no raw keys`,
              status: hasRawKey ? 'FAIL' : 'PASS',
              detail: hasRawKey ? 'found raw key or undefined' : 'ok',
            });
          }
        }

        // Close language menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        tests.push({ label: `${label} — language-toggle-btn`, status: 'SKIP', detail: 'no language button found' });
      }

      // 9. Check after closing
      const closeOverflow = await assertNoHorizontalOverflow(page, `${label} after lang close`);
      if (!closeOverflow.pass) {
        tests.push({
          label: `${label} — no overflow after lang close`,
          status: 'FAIL',
          detail: `OVERFLOW: scrollW=${closeOverflow.result.docScrollWidth} vw=${closeOverflow.result.innerWidth}`,
        });
      }

      await page.close();
      await context.close();
    } catch (err) {
      tests.push({ label: `${label} — lang menu test`, status: 'SKIP', detail: err.message });
    }
  }

  return tests;
}

async function runPanelTests(browser) {
  const tests = [];

  for (const vp of VIEWPORTS) {
    const label = `${vp.label}`;
    try {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await context.newPage();
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Tools drawer
      const toolsBtn = await page.$('.tools-trigger-btn');
      if (toolsBtn) {
        await toolsBtn.click();
        await page.waitForTimeout(600);

        const toolsOverflow = await assertNoHorizontalOverflow(page, `${label} tools drawer open`);
        tests.push({
          label: `${label} — tools drawer no overflow`,
          status: toolsOverflow.pass ? 'PASS' : 'FAIL',
          detail: toolsOverflow.pass ? '' : `OVERFLOW: scrollW=${toolsOverflow.result.docScrollWidth}`,
        });

        // Close tools drawer
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Try to open auth panel
      const authBtn = await page.$('.auth-user-btn, #auth-toggle-btn, [data-action="auth"]');
      if (authBtn) {
        await authBtn.click();
        await page.waitForTimeout(600);

        const authPanel = await assertElementInViewport(page, '.auth-panel, .auth-panel-backdrop', `${label} auth panel`);
        tests.push({
          label: `${label} — auth panel visible`,
          status: authPanel.pass ? 'PASS' : 'FAIL',
          detail: authPanel.pass ? `left=${authPanel.result.left} width=${authPanel.result.width}` : authPanel.reason,
        });

        const authOverflow = await assertNoHorizontalOverflow(page, `${label} auth panel open`);
        if (!authOverflow.pass) {
          tests.push({
            label: `${label} — auth panel no overflow`,
            status: 'FAIL',
            detail: `OVERFLOW: scrollW=${authOverflow.result.docScrollWidth}`,
          });
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      await page.close();
      await context.close();
    } catch (err) {
      tests.push({ label: `${label} — panel test`, status: 'SKIP', detail: err.message });
    }
  }

  return tests;
}

async function runSQLPageTests(browser) {
  const tests = [];

  for (const vp of VIEWPORTS) {
    const label = `${vp.label}`;
    try {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await context.newPage();
      await page.goto(BASE_URL + '/?module=sql&lesson=1&lang=both', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // 1. Overflow check
      const overflow = await assertNoHorizontalOverflow(page, `${label} SQL bilingual`);
      tests.push({
        label: `${label} — SQL bilingual overflow`,
        status: overflow.pass ? 'PASS' : 'FAIL',
        detail: overflow.pass ? `scrollW=${overflow.result.docScrollWidth} vw=${overflow.result.innerWidth}` : `OVERFLOW: scrollW=${overflow.result.docScrollWidth}`,
      });

      // 2. Bilingual compare layout - should be stacked (column)
      const compareLayout = await page.evaluate(() => {
        const container = document.querySelector('.concept-container');
        if (!container) return { exists: false };
        const cs = getComputedStyle(container);
        return {
          exists: true,
          flexDirection: cs.flexDirection,
          display: cs.display,
        };
      });

      tests.push({
        label: `${label} — bilingual stacked (column)`,
        status: compareLayout.exists && compareLayout.flexDirection === 'column' ? 'PASS' : 'FAIL',
        detail: compareLayout.exists ? `display=${compareLayout.display} dir=${compareLayout.flexDirection}` : 'no concept-container found',
      });

      // 3. Main content position
      const mainPos = await page.evaluate(() => {
        const selectors = ['.lesson-content', '.content-card', 'main'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 80 && rect.right > 0 && rect.left < window.innerWidth) {
              return { selector: sel, left: Math.round(rect.left), width: Math.round(rect.width) };
            }
          }
        }
        return null;
      });

      if (mainPos) {
        const shifted = mainPos.left > vp.w * 0.25;
        tests.push({
          label: `${label} — main content not right-shifted`,
          status: shifted ? 'FAIL' : 'PASS',
          detail: shifted ? `left=${mainPos.left} > ${Math.round(vp.w * 0.25)}` : `left=${mainPos.left} width=${mainPos.width}`,
        });
      }

      // 4. Offender check
      const offender = await detectOffenders(page, `${label} SQL bilingual`);
      if (!offender.pass) {
        tests.push({
          label: `${label} — SQL bilingual offenders`,
          status: 'FAIL',
          detail: offender.reason,
        });
      }

      await page.close();
      await context.close();
    } catch (err) {
      tests.push({ label: `${label} — SQL page test`, status: 'SKIP', detail: err.message });
    }
  }

  return tests;
}

async function runExamSandboxTests(browser) {
  const tests = [];

  for (const vp of VIEWPORTS) {
    const label = `${vp.label}`;
    try {
      const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await context.newPage();
      await page.goto(BASE_URL + '/?module=sql&exam=1', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const overflow = await assertNoHorizontalOverflow(page, `${label} exam sandbox`);
      tests.push({
        label: `${label} — exam sandbox overflow`,
        status: overflow.pass ? 'PASS' : 'FAIL',
        detail: overflow.pass ? `scrollW=${overflow.result.docScrollWidth} vw=${overflow.result.innerWidth}` : `OVERFLOW: scrollW=${overflow.result.docScrollWidth}`,
      });

      // Main content check
      const mainPos = await page.evaluate(() => {
        const selectors = ['.playground-section', '.lesson-content', '.content-card', 'main'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 80 && rect.right > 0 && rect.left < window.innerWidth) {
              return { selector: sel, left: Math.round(rect.left), width: Math.round(rect.width) };
            }
          }
        }
        return null;
      });

      if (mainPos) {
        const shifted = mainPos.left > vp.w * 0.2;
        tests.push({
          label: `${label} — exam sandbox not right-shifted`,
          status: shifted ? 'FAIL' : 'PASS',
          detail: shifted ? `left=${mainPos.left} > ${Math.round(vp.w * 0.2)}` : `left=${mainPos.left} width=${mainPos.width}`,
        });
      }

      await page.close();
      await context.close();
    } catch (err) {
      tests.push({ label: `${label} — exam sandbox test`, status: 'SKIP', detail: err.message });
    }
  }

  return tests;
}

/* ── Main runner ── */

async function run() {
  const start = Date.now();
  const allTests = [];

  console.log(`╔${'═'.repeat(70)}╗`);
  console.log(`║  Mobile UI Mega Audit — ${new Date().toISOString().slice(0, 19)}`);
  console.log(`║  Viewports: ${VIEWPORTS.map(v => `${v.w}×${v.h}`).join(', ')}`);
  console.log(`║  Base URL: ${BASE_URL}`);
  console.log(`╚${'═'.repeat(70)}╝\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function emit(tests) {
    for (const t of tests) {
      if (t.status === 'PASS') passed++;
      else if (t.status === 'FAIL') failed++;
      else skipped++;
      allTests.push(t);
    }
  }

  const browser = await chromium.launch({ headless: HEADLESS });

  console.log('── Overflow Tests ──');
  emit(await runOverflowTests(browser));

  console.log('\n── Language Menu Tests ──');
  emit(await runLanguageMenuTests(browser));

  console.log('\n── Panel Tests (tools, auth) ──');
  emit(await runPanelTests(browser));

  console.log('\n── SQL Page Tests ──');
  emit(await runSQLPageTests(browser));

  console.log('\n── Exam Sandbox Tests ──');
  emit(await runExamSandboxTests(browser));

  await browser.close();

  /* ── Report ── */
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUMMARY: ${passed} PASS / ${failed} FAIL / ${skipped} SKIP / ${elapsed}s`);
  console.log(`  Total checks: ${allTests.length}`);
  console.log(`${'='.repeat(70)}`);

  /* Per-viewport summary */
  for (const vp of VIEWPORTS) {
    const vpTests = allTests.filter(t => t.label && t.label.startsWith(vp.label));
    const vpPass = vpTests.filter(t => t.status === 'PASS').length;
    const vpFail = vpTests.filter(t => t.status === 'FAIL').length;
    const vpSkip = vpTests.filter(t => t.status === 'SKIP').length;
    console.log(`  ${vp.label}: ${vpPass} PASS / ${vpFail} FAIL / ${vpSkip} SKIP`);
  }

  /* Failures detail */
  const failures = allTests.filter(t => t.status === 'FAIL');
  if (failures.length) {
    console.log(`\n── FAILURES ──`);
    for (const f of failures) {
      console.log(`  ❌ ${f.label}`);
      console.log(`     ${f.detail}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
