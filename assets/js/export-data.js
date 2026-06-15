/**
 * Study Tools Export Data — Round 32.0 MVP
 *
 * Collects local learning data from localStorage and triggers
 * a JSON download. Read-only — no writes, no uploads, no Supabase.
 *
 * Globally accessible via `window.StudyExport.exportData()`.
 * Called from the Tools Drawer "Export Data" entry.
 */
(function () {
  "use strict";

  /* ── Sensitive key denylist ───────────────────── */
  var DENY_PREFIXES = [
    "supabase", "sb-", "workbuddy", "codebuddy",
    "ai_provider", "openai", "anthropic", "gemini",
    "deepseek", "AI_", "ai_api", "api_key", "token",
    "session", "jwt", "cookie", "password", "credential",
    "private_key", "secret", "auth_token"
  ];

  var DENY_EXACT = [
    "study-tools-sync-queue",
    "study-tools-sync-enabled",
    "study-tools-queue-version",
    "study-tools-typing-synced-keys",
    "study-tools-exam-synced-keys",
    "study-tools-typing-bookmarks-sync-v1",
    "study-tools-wrong-book-sync-meta-v1",
  ];

  function isDenied(key) {
    if (DENY_EXACT.indexOf(key) !== -1) return true;
    var lower = key.toLowerCase();
    for (var i = 0; i < DENY_PREFIXES.length; i++) {
      if (lower.indexOf(DENY_PREFIXES[i]) !== -1) return true;
    }
    return false;
  }

  /* ── Data collection ──────────────────────────── */
  function collectData() {
    var data = {
      _meta: {
        exportedAt: new Date().toISOString(),
        appVersion: (window.STUDY_TOOLS_VERSION && window.STUDY_TOOLS_VERSION.webVersion) || "unknown",
        deviceId: safeGet("study_tools_device_id", null),
        formatVersion: 1,
      },
      completedLessons: {},
      quizResults: {},
      wrongBook: [],
      bookmarks: [],
      typingHistory: {},
      examHistory: [],
      dashboardGoals: null,
      syncSummary: {},
      userSettings: {},
    };

    /* Completed lessons */
    var completedKeys = [
      "sql_hub_completed",
      "itpass_completed_lessons",
      "sg_completed_lessons",
      "python_completed_lessons",
      "java_completed_lessons",
    ];
    completedKeys.forEach(function (k) {
      var val = safeGet(k, null);
      if (val !== null) data.completedLessons[k] = val;
    });

    /* Quiz results (all quiz_completed_* keys) */
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var lk = localStorage.key(i);
        if (lk && lk.indexOf("_quiz_completed_") !== -1 && !isDenied(lk)) {
          var qz = safeGet(lk, null);
          if (qz !== null) data.quizResults[lk] = qz;
        }
      }
    } catch (_) {}

    /* Java/Python sandbox progress keys */
    try {
      for (var j = 0; j < localStorage.length; j++) {
        var pk = localStorage.key(j);
        if (pk && (pk.indexOf("_progress_") !== -1) && !isDenied(pk)) {
          var pv = safeGet(pk, null);
          if (pv !== null) data.quizResults[pk] = pv;
        }
      }
    } catch (_) {}

    /* Wrong book */
    data.wrongBook = safeGet("study-tools-exam-wrong-book-v1", []);

    /* Bookmarks (from typing favorites) */
    try {
      var typingData = safeGet("study-tools-japanese-typing-v1", {});
      var favs = Array.isArray(typingData.favorites) ? typingData.favorites : [];
      data.bookmarks = favs;
    } catch (_) {
      data.bookmarks = [];
    }

    /* Typing history */
    var typingKeys = [
      "study-tools-japanese-typing-v1",
      "study-tools-coding-typing-history-v1",
    ];
    typingKeys.forEach(function (tk) {
      var tv = safeGet(tk, null);
      if (tv !== null) data.typingHistory[tk] = tv;
    });

    /* Exam history */
    data.examHistory = safeGet("study-tools-exam-history-v1", []);

    /* Dashboard goals */
    data.dashboardGoals = safeGet("study-tools-dashboard-goals-v1", null);

    /* Sync summary (non-sensitive) */
    data.syncSummary.lastSyncAt = safeGet("study_tools_last_sync_at", null);
    data.syncSummary.lastSyncResult = safeGet("study_tools_last_sync_result", null);

    /* User settings (language and theme only) */
    try {
      var lang = localStorage.getItem("study-tools-language");
      if (lang) data.userSettings.language = lang;
      var theme = localStorage.getItem("study-tools-theme");
      if (theme) data.userSettings.theme = theme;
    } catch (_) {}

    /* Wrong book retry settings */
    var retrySettings = safeGet("study-tools-wrong-book-retry-settings-v1", null);
    if (retrySettings !== null) data.userSettings.wrongBookRetrySettings = retrySettings;

    return data;
  }

  /* ── Helpers ──────────────────────────────────── */
  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function fmtDate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + m + day;
  }

  /* ── I18n helpers ─────────────────────────────── */
  function t(key, fallback) {
    try {
      if (window.I18N && typeof window.I18N.t === "function") {
        return window.I18N.t(key) || fallback;
      }
    } catch (_) {}
    return fallback;
  }

  function showExportToast(type, msg) {
    if (typeof showToast === "function") {
      showToast(msg, type);
    } else {
      try { window.alert(msg); } catch (_) {}
    }
  }

  /* ── Public API ───────────────────────────────── */
  function exportData() {
    var data;
    try {
      data = collectData();
    } catch (e) {
      showExportToast("error", t("tools.exportFailed", "Export failed") + ": " + (e.message || "unknown error"));
      return;
    }

    var json;
    try {
      json = JSON.stringify(data, null, 2);
    } catch (e) {
      showExportToast("error", t("tools.exportFailed", "Export failed") + ": JSON serialization error");
      return;
    }

    var filename = "study-tools-backup-" + fmtDate() + ".json";
    var blob;
    try {
      blob = new Blob([json], { type: "application/json" });
    } catch (_) {
      showExportToast("error", t("tools.exportFailed", "Export failed") + ": cannot create file");
      return;
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up blob URL after a short delay
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    showExportToast("success", t("tools.exportSuccess", "Exported successfully") + " — " + filename);
  }

  function getExportInfo() {
    return {
      scope: [
        "completedLessons",
        "quizResults",
        "wrongBook",
        "bookmarks",
        "typingHistory",
        "examHistory",
        "dashboardGoals",
        "syncSummary (non-sensitive)",
        "userSettings (language, theme, retry settings)",
      ],
      excluded: [
        "passwords, tokens, JWTs, sessions",
        "Supabase keys, API keys",
        "AI provider keys",
        "auth sessions, cookies",
        "sync queue internals",
        "synced-keys metadata",
      ],
    };
  }

  /* ── Export ───────────────────────────────────── */
  window.StudyExport = {
    exportData: exportData,
    getExportInfo: getExportInfo,
  };
})();
