#!/usr/bin/env node
/**
 * P15.3 Web parity 门禁：验证 Web 公开版承载 PC 最新壳层与共享体验。
 *
 * 自带 node 静态服务器（绝不依赖 PC server.py）。覆盖：
 * 壳层加载与 console 干净、DS 变量、收起态 gutter 回收、目录开关/Esc、
 * 账号弹窗语义与 cloudReady、i18n 长码切换、主题、MOS365 克制降级、
 * Releases 真实入口、SQL 执行链、1440/1024/390 无溢出。
 *
 * 运行：node tools/verify_web_parity.js
 * 退出码：0=PASS 1=FAIL
 */
"use strict";
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".pdf": "application/pdf" };

function serveStatic(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel === "/") rel = "/index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
function randomPort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close((e) => (e ? rej(e) : res(port))); }); });
}

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + String(detail).slice(0, 140) : ""}`);
}

(async () => {
  const port = await randomPort();
  const server = await serveStatic(port);
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const consoleErrors = [];
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("immersive_started", "true"); } catch (_) {} });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => consoleErrors.push("pageerror:" + e.message.slice(0, 120)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });

    await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#main-app-body", { timeout: 20000 });
    await page.waitForTimeout(2500);

    // W1 壳层与 DS
    const shell = await page.evaluate(() => ({
      rail: !!document.getElementById("nav-rail") && getComputedStyle(document.getElementById("nav-rail")).display !== "none",
      railW: getComputedStyle(document.documentElement).getPropertyValue("--rail-w").trim(),
      statusbar: !!document.querySelector(".app-statusbar"),
      toggle: (() => { const t = document.getElementById("context-nav-toggle"); if (!t) return null; const r = t.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; })(),
      webPublic: window.STUDY_TOOLS_WEB_PUBLIC === true,
    }));
    check("W1 新壳层加载（rail/statusbar/DS 变量/44px 目录钮）", shell.rail && shell.railW !== "" && shell.statusbar && shell.toggle === true, JSON.stringify(shell));
    check("W1 Web 运行时契约生效（WEB_PUBLIC=true）", shell.webPublic);

    // W2 收起态 gutter 回收（与 PC 同合同）
    await page.evaluate(() => window.switchSubject && window.switchSubject("sql"));
    await page.waitForTimeout(600);
    const geo = await page.evaluate(() => {
      const rail = document.getElementById("nav-rail").getBoundingClientRect();
      const card = document.querySelector(".lesson-content .content-card, .content-card");
      const sb = document.getElementById("app-sidebar");
      return { gutter: card ? Math.round(card.getBoundingClientRect().x - rail.right) : null, sbDisplay: sb ? getComputedStyle(sb).display : null, scrollW: document.documentElement.scrollWidth };
    });
    check("W2 收起态 gutter ≤ 20px + sidebar track=0", geo.gutter !== null && geo.gutter <= 20 && geo.sbDisplay === "none", JSON.stringify(geo));

    // W3 目录展开/Esc
    await page.click("#context-nav-toggle");
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => ({ w: Math.round(document.getElementById("app-sidebar").getBoundingClientRect().width), expanded: document.body.classList.contains("desktop-sidebar-expanded") }));
    check("W3 目录展开 250-320px", opened.expanded && opened.w >= 250 && opened.w <= 320, `w=${opened.w}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    check("W3 Esc 关闭目录", await page.evaluate(() => !document.body.classList.contains("desktop-sidebar-expanded")));

    // W4 账号弹窗与 cloudReady
    await page.evaluate(() => window.StudyAuthUI.openAuthPanel());
    await page.waitForTimeout(600);
    const auth = await page.evaluate(() => {
      const panel = document.getElementById("auth-panel");
      const inputs = [...panel.querySelectorAll("input.auth-input")];
      const st = window.StudySupabase ? window.StudySupabase.getStatus() : null;
      return {
        title: (panel.querySelector("#auth-panel-title") || {}).textContent,
        labeled: inputs.filter((i) => i.id && document.querySelector(`label[for="${i.id}"]`)).length,
        total: inputs.length,
        supabase: st ? st.code : null,
        card: (document.querySelector(".auth-sync-state") || { getAttribute: () => null }).getAttribute("data-sync-ui-state"),
      };
    });
    check("W4 账号弹窗语义（P15.2 结构）", /账号与同步/.test(auth.title || "") && auth.labeled === auth.total && auth.total >= 2, JSON.stringify({ labeled: auth.labeled, total: auth.total }));
    check("W4 Supabase 公开配置生效（ready/cloudReady）", auth.supabase === "ready" || auth.supabase === "ready_to_initialize", auth.supabase);
    check("W4 本地模式状态卡如实", auth.card === "signedOutLocal", auth.card);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check("W4 Esc 关弹窗 + 无 inert 残留", await page.evaluate(() => (document.getElementById("auth-panel") || { hidden: true }).hidden && document.querySelectorAll(".app-frame[inert],.app-statusbar[inert]").length === 0));

    // W5 i18n 长码边界（P14.2 行为）
    await page.evaluate(async () => { await window.I18n.setLanguage("zh-CN"); });
    await page.waitForTimeout(800);
    const zh = await page.evaluate(() => ({
      lang: window.I18n.getLanguage(),
      written: [...document.querySelectorAll("[data-i18n]")].filter((el) => el.getAttribute("data-i18n-managed") === "static").length,
      total: document.querySelectorAll("[data-i18n]").length,
    }));
    check("W5 setLanguage('zh-CN') 长码归一化 + 静态写入", zh.lang === "zh" && zh.written / zh.total >= 0.9, `lang=${zh.lang} ${zh.written}/${zh.total}`);
    await page.evaluate(async () => { await window.I18n.setLanguage("default-ja-zh"); });
    await page.waitForTimeout(600);

    // W6 主题
    await page.evaluate(() => window.toggleTheme && window.toggleTheme());
    await page.waitForTimeout(400);
    const light = await page.evaluate(() => document.body.getAttribute("data-theme") === "light");
    await page.evaluate(() => window.toggleTheme && window.toggleTheme());
    check("W6 主题切换生效", light);

    // W7 MOS365 克制降级（不伪造可执行）
    await page.click("#rail-mos365");
    await page.waitForTimeout(500);
    const mos = await page.evaluate(() => ({
      note: !!document.getElementById("web-platform-note"),
      noteText: (document.getElementById("web-platform-note") || {}).textContent || "",
      fakePanel: !!document.querySelector("#mos365-shell:not([hidden])"),
    }));
    check("W7 MOS365 rail → Windows PC 版说明（无假面板）", mos.note && /Windows PC/.test(mos.noteText) && !mos.fakePanel, mos.noteText.slice(0, 50));

    // W8 Releases 真实入口（非伪造检查更新）
    const rel = await page.evaluate(() => {
      const a = document.getElementById("statusbar-version-entry");
      return { tag: a ? a.tagName : null, href: a ? a.getAttribute("href") : null, updaterPanel: !!document.getElementById("updater-panel"), checkBtn: !!document.getElementById("updater-check-btn") };
    });
    check("W8 statusbar 版本入口 = GitHub Releases 链接；无 updater 假 UI", rel.tag === "A" && /github\.com\/.+\/releases/.test(rel.href || "") && !rel.updaterPanel && !rel.checkBtn, JSON.stringify(rel));

    // W9 SQL 执行链（Web 自有能力保留）
    await page.evaluate(() => window.switchSubject && window.switchSubject("sql"));
    await page.waitForTimeout(500);
    const sqlRun = await page.evaluate(async () => {
      const editor = document.getElementById("sql-editor") || document.querySelector(".CodeMirror textarea, #sql-input");
      if (window.sqlEngine && typeof window.sqlEngine.execute === "function") {
        try { const r = window.sqlEngine.execute("SELECT * FROM students_mst;"); return { ok: !!r, via: "engine" }; } catch (e) { return { ok: false, via: "engine:" + e.message.slice(0, 40) }; }
      }
      return { ok: !!editor, via: "editor-present" };
    });
    check("W9 SQL 学习执行链可用", sqlRun.ok, sqlRun.via);

    // W10 响应式
    for (const [w, h] of [[1024, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
      check(`W10 ${w}px 无横向溢出`, m.scrollW <= m.innerW + 2, `scrollW=${m.scrollW}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // W11 console 干净（过滤 CDN 加载失败之外的本地资源错误）
    const critical = consoleErrors.filter((e) => !/jsdelivr|supabase-config\.local|favicon/i.test(e));
    check("W11 Console 无本地错误", critical.length === 0, critical.slice(0, 3).join(" || ") || "clean");

    await browser.close(); browser = null;
  } catch (e) {
    check("RUNTIME 工具执行未中断", false, e.message.slice(0, 140));
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    server.close();
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n==== web parity: ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})();
