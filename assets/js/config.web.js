/**
 * Web 公开版全局配置（Web-only 适配层）
 * =====================
 * 桌面完整版依赖本地 server.py / study_ai.py 提供后端 API。
 * Web 公开版不使用本地后端 — 所有本地接口请求默认禁用。
 *
 * P15.3：共享文件（i18n-ui-dict.js / app.js / shell.js 等）由 PC Canonical
 * Source 同步覆盖——Web 专有的 i18n key 与平台降级逻辑集中在本文件，
 * 不写入共享文件（详见 docs/PC_WEB_SYNC_CONTRACT.md）。
 */
window.STUDY_TOOLS_API_BASE = window.STUDY_TOOLS_API_BASE || "/api/execute";
window.STUDY_TOOLS_WEB_PUBLIC = true;
window.STUDY_TOOLS_DISABLE_LOCAL_BACKEND = true;

/* ── Web 专有 i18n key（运行时注入，避免污染 PC 同步的共享 dict） ── */
(function () {
  "use strict";
  var WEB_KEYS = {
    "zh-CN": { tools: {
      releaseNotes: "发布说明",
      releaseNotesDesc: "查看版本历史与 Windows PC 版下载",
      mosPcOnlyTitle: "MOS365 实操训练",
      mosPcOnlyDesc: "Excel 实操训练需要本地 Excel 环境，在 Windows PC 版中可用。Web 版可继续学习其他全部课程。",
    } },
    "ja-JP": { tools: {
      releaseNotes: "リリースノート",
      releaseNotesDesc: "更新履歴と Windows PC 版のダウンロード",
      mosPcOnlyTitle: "MOS365 実技トレーニング",
      mosPcOnlyDesc: "Excel 実技トレーニングはローカルの Excel 環境が必要なため、Windows PC 版でご利用いただけます。Web 版では他のすべての講座を学習できます。",
    } },
    "en-US": { tools: {
      releaseNotes: "Release notes",
      releaseNotesDesc: "Version history and Windows PC download",
      mosPcOnlyTitle: "MOS365 hands-on training",
      mosPcOnlyDesc: "Excel hands-on training needs a local Excel environment and is available in the Windows PC edition. Everything else works right here on the web.",
    } },
    "default-ja-zh": { tools: {
      releaseNotes: "发布说明 / リリースノート",
      releaseNotesDesc: "查看版本历史与 Windows PC 版下载 / 更新履歴と PC 版ダウンロード",
      mosPcOnlyTitle: "MOS365 实操训练 / MOS365 実技トレーニング",
      mosPcOnlyDesc: "Excel 实操训练需要本地 Excel 环境，在 Windows PC 版中可用；Web 版可学习其他全部课程。/ Excel 実技はローカル環境が必要なため Windows PC 版で利用できます。他の講座は Web でも学べます。",
    } },
  };
  function inject() {
    if (!window.I18nUiDict) return false;
    Object.keys(WEB_KEYS).forEach(function (locale) {
      if (!window.I18nUiDict[locale]) window.I18nUiDict[locale] = {};
      if (!window.I18nUiDict[locale].tools) window.I18nUiDict[locale].tools = {};
      Object.assign(window.I18nUiDict[locale].tools, WEB_KEYS[locale].tools);
    });
    return true;
  }
  if (!inject()) document.addEventListener("DOMContentLoaded", inject);

  /* ── MOS365 rail 入口：Windows PC 版可用的克制说明（不伪造可执行、不阻断学习） ── */
  function t(key, fallback) {
    if (window.I18n && typeof window.I18n.t === "function") {
      var v = window.I18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }
  var noteTimer = null;
  function showMosPlatformNote() {
    var existing = document.getElementById("web-platform-note");
    if (existing) existing.remove();
    if (noteTimer) clearTimeout(noteTimer);
    var note = document.createElement("div");
    note.id = "web-platform-note";
    note.setAttribute("role", "status");
    note.style.cssText = "position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:1200;" +
      "max-width:min(480px,92vw);padding:12px 16px;border-radius:8px;" +
      "background:var(--bg-1,#1c1c1a);border:1px solid var(--bd-2,rgba(255,255,255,0.14));" +
      "color:var(--tx-1,#e8e6e3);font-size:13px;line-height:1.55;box-shadow:0 8px 28px rgba(0,0,0,0.35);";
    note.innerHTML = '<strong style="display:block;margin-bottom:4px;">' +
      '<i class="fa-solid fa-desktop" aria-hidden="true"></i> ' +
      t("tools.mosPcOnlyTitle", "MOS365 实操训练 / MOS365 実技トレーニング") + "</strong>" +
      '<span style="color:var(--tx-2,#b7b4af);">' +
      t("tools.mosPcOnlyDesc", "Excel 实操训练在 Windows PC 版中可用；Web 版可学习其他全部课程。") + "</span>";
    document.body.appendChild(note);
    noteTimer = setTimeout(function () { note.remove(); }, 6000);
  }
  document.addEventListener("click", function (e) {
    var mosBtn = e.target.closest && e.target.closest("#rail-mos365");
    if (!mosBtn) return;
    e.preventDefault();
    e.stopPropagation();
    showMosPlatformNote();
  }, true);
})();
