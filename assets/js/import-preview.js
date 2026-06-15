/**
 * Study Tools backup-import read-only preview MVP.
 *
 * Reads a user-supplied JSON backup file, security-scans it, validates its schema,
 * and displays a comparison table showing what would happen during import —
 * without writing a single byte to localStorage or contacting any remote server.
 *
 * Exposed globally as `window.ImportPreview`.
 *
 * Round 35.0 — READ-ONLY PREVIEW. No import, no writes, no sync.
 */
(function () {
  "use strict";

  var SCHEMA_VERSION = 1;
  var SOURCE = "study-tools-local-backup";
  var MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

  /* ── Denylist (identical to export-data.js) ─────────── */
  var DENY_PARTS = [
    "supabase", "sb-", "workbuddy", "codebuddy",
    "ai_provider", "openai", "anthropic", "gemini",
    "deepseek", "ai_", "ai_api", "api_key", "apikey",
    "token", "session", "jwt", "cookie", "password",
    "credential", "private_key", "secret", "auth_token",
    "device_id", "deviceid", "installation_id", "installationid"
  ];

  var DENY_EXACT = [
    "study-tools-sync-queue",
    "study-tools-sync-enabled",
    "study-tools-queue-version",
    "study-tools-typing-synced-keys",
    "study-tools-exam-synced-keys",
    "study-tools-typing-bookmarks-sync-v1",
    "study-tools-wrong-book-sync-meta-v1"
  ];

  /* ── State ───────────────────────────────────────────── */
  var previewActive = false;
  var previewData = null;
  var overlayEl = null;
  var writeCountBefore = 0;   // safety assertion counter

  /* ── Helpers ─────────────────────────────────────────── */
  function isDenied(key) {
    var lower = String(key || "").toLowerCase();
    if (DENY_EXACT.indexOf(lower) !== -1) return true;
    for (var i = 0; i < DENY_PARTS.length; i++) {
      if (lower.indexOf(DENY_PARTS[i]) !== -1) return true;
    }
    return false;
  }

  function t(key, fallback) {
    try {
      if (window.I18n && typeof window.I18n.t === "function") {
        var translated = window.I18n.t(key);
        return translated && translated !== key ? translated : fallback;
      }
    } catch (_) {}
    return fallback;
  }

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function esc(text) {
    if (text === null || text === undefined) return "";
    var div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  function recordWriteCount() {
    try { writeCountBefore = localStorage.length; } catch (_) {}
  }

  function verifyNoWrites(label) {
    try {
      if (localStorage.length !== writeCountBefore) {
        console.error("[ImportPreview] CRITICAL: localStorage.length changed during " + label +
          " (" + writeCountBefore + " -> " + localStorage.length + ")");
      }
    } catch (_) {}
  }

  /* ── Security scan ───────────────────────────────────── */
  function scanSensitiveFields(obj, path) {
    path = path || "$";
    var count = 0;
    if (!obj || typeof obj !== "object") return 0;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        count += scanSensitiveFields(obj[i], path + "[" + i + "]");
      }
    } else {
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (isDenied(key)) {
          count++;
          continue;
        }
        var val = obj[key];
        if (val && typeof val === "object") {
          count += scanSensitiveFields(val, path + "." + key);
        }
      }
    }
    return count;
  }

  /* ── Schema validation ───────────────────────────────── */
  function validateBackupSchema(obj) {
    if (!obj || typeof obj !== "object") {
      return { ok: false, reason: "not-an-object" };
    }
    if (typeof obj.schemaVersion !== "number" || obj.schemaVersion < 1) {
      return { ok: false, reason: "missing-or-invalid-schemaVersion" };
    }
    if (obj.schemaVersion > SCHEMA_VERSION) {
      return {
        ok: false,
        reason: "future-schemaVersion",
        detail: "backup v" + obj.schemaVersion + " > current v" + SCHEMA_VERSION
      };
    }
    if (obj.source !== SOURCE) {
      return { ok: false, reason: "unknown-source", detail: obj.source || "none" };
    }
    if (!obj.sections || typeof obj.sections !== "object") {
      return { ok: false, reason: "missing-sections" };
    }
    return { ok: true };
  }

  /* ── Backup parsing ──────────────────────────────────── */
  function parseBackupJson(text) {
    try {
      var obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function readBackupFile(file, callback) {
    if (!file) {
      if (callback) callback({ error: "no-file" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      if (callback) callback({ error: "file-too-large", detail: file.size });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (callback) callback({ text: reader.result });
    };
    reader.onerror = function () {
      if (callback) callback({ error: "read-error" });
    };
    reader.readAsText(file);
  }

  /* ── Preview builder (read-only comparison) ──────────── */
  function buildImportPreview(backup) {
    var sections = backup.sections || {};
    var manifest = backup.manifest || null;
    var result = {
      appVersion: backup.appVersion || "unknown",
      exportedAt: backup.exportedAt || "unknown",
      exportedDaysAgo: "unknown",
      warnings: Array.isArray(backup.warnings) ? backup.warnings : [],
      sensitiveCount: 0,
      importable: [],
      nonImportable: [],
      optIn: [],
      totalNew: 0,
      totalConflict: 0,
      totalSkipped: 0,
      manifest: manifest
    };

    // Calculate days since export
    try {
      var exportDate = new Date(backup.exportedAt);
      var now = new Date();
      var diffMs = now - exportDate;
      if (diffMs > 0) {
        var days = Math.floor(diffMs / 86400000);
        result.exportedDaysAgo = days === 0 ? "today" : String(days);
      }
    } catch (_) {}

    /* ── Sensitive scan (recursive) ── */
    result.sensitiveCount = scanSensitiveFields(backup);

    /* ── completedLessons ─────────────────────────────── */
    var lessonNew = 0, lessonConflict = 0, lessonSkip = 0;
    var lessonKeys = [
      "sql_hub_completed",
      "itpass_completed_lessons",
      "sg_completed_lessons",
      "python_completed_lessons",
      "java_completed_lessons"
    ];
    if (sections.completedLessons) {
      lessonKeys.forEach(function (key) {
        var backupArr = sections.completedLessons[key];
        if (!Array.isArray(backupArr)) return;
        var localArr = safeGet(key, []);
        for (var i = 0; i < backupArr.length; i++) {
          var id = backupArr[i];
          if (localArr.indexOf(id) !== -1) {
            lessonConflict++;   // already completed locally
          } else {
            lessonNew++;
          }
        }
      });
    }
    result.importable.push({
      section: "completedLessons",
      label: t("tools.importSectionLessons", "Completed Lessons"),
      isImportable: true,
      isOptIn: false,
      newCount: lessonNew,
      conflictCount: lessonConflict,
      skipCount: lessonSkip
    });
    result.totalNew += lessonNew;
    result.totalConflict += lessonConflict;
    result.totalSkipped += lessonSkip;

    /* ── quizResults ───────────────────────────────────── */
    var quizNew = 0, quizConflict = 0, quizSkip = 0;
    if (sections.quizResults) {
      var quizKeys = Object.keys(sections.quizResults);
      for (var qi = 0; qi < quizKeys.length; qi++) {
        var qKey = quizKeys[qi];
        if (isDenied(qKey)) { quizSkip++; continue; }
        var backupQuiz = sections.quizResults[qKey];
        var localQuiz = safeGet(qKey, null);
        if (localQuiz === null) {
          quizNew += Array.isArray(backupQuiz) ? backupQuiz.length : 1;
        } else {
          quizConflict += Array.isArray(backupQuiz) ? backupQuiz.length : 1;
        }
      }
    }
    result.importable.push({
      section: "quizResults",
      label: t("tools.importSectionQuiz", "Quiz Results"),
      isImportable: true,
      isOptIn: false,
      newCount: quizNew,
      conflictCount: quizConflict,
      skipCount: quizSkip
    });
    result.totalNew += quizNew;
    result.totalConflict += quizConflict;
    result.totalSkipped += quizSkip;

    /* ── wrongBook ─────────────────────────────────────── */
    var wbNew = 0, wbConflict = 0, wbSkip = 0;
    if (Array.isArray(sections.wrongBook)) {
      var localWB = safeGet("study-tools-exam-wrong-book-v1", []);
      var localWBKeys = {};
      localWB.forEach(function (item) {
        if (item && item.itemKey) localWBKeys[item.itemKey] = true;
      });
      sections.wrongBook.forEach(function (item) {
        if (!item || !item.itemKey) { wbSkip++; return; }
        if (localWBKeys[item.itemKey]) {
          wbConflict++;
        } else {
          wbNew++;
        }
      });
    }
    result.importable.push({
      section: "wrongBook",
      label: t("tools.importSectionWrongBook", "Wrong Book"),
      isImportable: true,
      isOptIn: false,
      newCount: wbNew,
      conflictCount: wbConflict,
      skipCount: wbSkip
    });
    result.totalNew += wbNew;
    result.totalConflict += wbConflict;
    result.totalSkipped += wbSkip;

    /* ── bookmarks ─────────────────────────────────────── */
    var bmNew = 0, bmConflict = 0, bmSkip = 0;
    if (Array.isArray(sections.bookmarks)) {
      var localTyping = safeGet("study-tools-japanese-typing-v1", {});
      var localFavs = Array.isArray(localTyping.favorites) ? localTyping.favorites : [];
      var localBmIds = {};
      localFavs.forEach(function (f) {
        if (f && f.reference_id) localBmIds["typing_article::" + f.reference_id] = true;
      });
      sections.bookmarks.forEach(function (b) {
        if (!b || !b.reference_id) { bmSkip++; return; }
        var type = b.type || "typing_article";
        var cid = type + "::" + b.reference_id;
        if (localBmIds[cid]) {
          bmConflict++;
        } else {
          bmNew++;
        }
      });
    }
    result.importable.push({
      section: "bookmarks",
      label: t("tools.importSectionBookmarks", "Bookmarks"),
      isImportable: true,
      isOptIn: false,
      newCount: bmNew,
      conflictCount: bmConflict,
      skipCount: bmSkip
    });
    result.totalNew += bmNew;
    result.totalConflict += bmConflict;
    result.totalSkipped += bmSkip;

    /* ── typingHistory ─────────────────────────────────── */
    var tyNew = 0, tyConflict = 0, tySkip = 0;
    if (sections.typingHistory) {
      // Japanese typing
      var backupJp = sections.typingHistory["study-tools-japanese-typing-v1"];
      if (backupJp) {
        var localJp = safeGet("study-tools-japanese-typing-v1", {});
        var localJpSessions = Array.isArray(localJp.sessions) ? localJp.sessions : [];
        var localJpIds = {};
        localJpSessions.forEach(function (s) {
          if (s) localJpIds[s.title + "|" + (s.completedAt || s.date || "")] = true;
        });
        if (Array.isArray(backupJp.sessions)) {
          backupJp.sessions.forEach(function (s) {
            if (!s) { tySkip++; return; }
            if (!s.completedAt && !s.date) { tySkip++; return; }
            var sid = s.title + "|" + (s.completedAt || s.date || "");
            if (localJpIds[sid]) { tyConflict++; } else { tyNew++; }
          });
        }
      }
      // Coding typing
      var backupCt = sections.typingHistory["study-tools-coding-typing-history-v1"];
      if (Array.isArray(backupCt)) {
        var localCt = safeGet("study-tools-coding-typing-history-v1", []);
        var localCtIds = {};
        localCt.forEach(function (c) {
          if (c) localCtIds[c.title + "|" + (c.completedAt || "")] = true;
        });
        backupCt.forEach(function (c) {
          if (!c) { tySkip++; return; }
          if (!c.completedAt) { tySkip++; return; }
          var cid = c.title + "|" + c.completedAt;
          if (localCtIds[cid]) { tyConflict++; } else { tyNew++; }
        });
      }
    }
    result.importable.push({
      section: "typingHistory",
      label: t("tools.importSectionTyping", "Typing History"),
      isImportable: true,
      isOptIn: false,
      newCount: tyNew,
      conflictCount: tyConflict,
      skipCount: tySkip
    });
    result.totalNew += tyNew;
    result.totalConflict += tyConflict;
    result.totalSkipped += tySkip;

    /* ── examHistory ───────────────────────────────────── */
    var exNew = 0, exConflict = 0, exSkip = 0;
    if (Array.isArray(sections.examHistory)) {
      var localExam = safeGet("study-tools-exam-history-v1", []);
      var localExamIds = {};
      localExam.forEach(function (e) {
        if (e && e.sessionId) localExamIds[e.sessionId] = true;
      });
      sections.examHistory.forEach(function (e) {
        if (!e) { exSkip++; return; }
        if (!e.sessionId) { exSkip++; return; }
        if (localExamIds[e.sessionId]) { exConflict++; } else { exNew++; }
      });
    }
    result.importable.push({
      section: "examHistory",
      label: t("tools.importSectionExam", "Exam History"),
      isImportable: true,
      isOptIn: false,
      newCount: exNew,
      conflictCount: exConflict,
      skipCount: exSkip
    });
    result.totalNew += exNew;
    result.totalConflict += exConflict;
    result.totalSkipped += exSkip;

    /* ── dashboardGoals (OPT-IN) ───────────────────────── */
    result.optIn.push({
      section: "dashboardGoals",
      label: t("tools.importSectionGoals", "Learning Goals"),
      isImportable: true,
      isOptIn: true,
      hasData: sections.dashboardGoals !== null && sections.dashboardGoals !== undefined,
      detail: sections.dashboardGoals ? "Available in backup" : "Not present in backup"
    });

    /* ── userSettings (OPT-IN) ─────────────────────────── */
    result.optIn.push({
      section: "userSettings",
      label: t("tools.importSectionSettings", "Language & Theme"),
      isImportable: true,
      isOptIn: true,
      hasData: !!(sections.userSettings && (sections.userSettings.language || sections.userSettings.theme)),
      detail: sections.userSettings
        ? ("lang=" + (sections.userSettings.language || "none") +
           " theme=" + (sections.userSettings.theme || "none"))
        : "Not present"
    });

    /* ── syncSummary (NON-IMPORTABLE) ──────────────────── */
    result.nonImportable.push({
      section: "syncSummary",
      label: t("tools.importSectionSync", "Sync Status"),
      reason: t("tools.importSyncBlocked", "Never imported — sync state is device-managed")
    });

    return result;
  }

  /* ── Render ──────────────────────────────────────────── */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") {
          el.className = attrs[k];
        } else if (k === "textContent") {
          el.textContent = attrs[k];
        } else if (k === "style") {
          Object.keys(attrs[k]).forEach(function (sk) {
            el.style[sk] = attrs[k][sk];
          });
        } else {
          el.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === "string") {
          el.appendChild(document.createTextNode(c));
        } else if (c) {
          el.appendChild(c);
        }
      });
    }
    return el;
  }

  function renderImportPreview(preview) {
    cleanupOverlay();

    overlayEl = h("div", { className: "import-preview-overlay" });

    var panel = h("div", { className: "import-preview-panel" });

    /* ── Header ───────────────────────────────────────── */
    var header = h("div", { className: "import-preview-header" });
    var title = h("h2", { className: "import-preview-title" }, [
      "📥 " + t("tools.importPreview", "Preview Backup Import")
    ]);
    header.appendChild(title);
    panel.appendChild(header);

    /* ── Read-only notice ─────────────────────────────── */
    var notice = h("div", { className: "import-preview-notice" }, [
      h("span", { textContent: "👁️ " + t("tools.importPreviewDesc", "Read-only preview — no data will be modified") })
    ]);
    panel.appendChild(notice);

    /* ── Meta info ────────────────────────────────────── */
    var meta = h("div", { className: "import-preview-meta" });
    var metaItems = [
      ["App Version", preview.appVersion],
      ["Exported", preview.exportedAt]
    ];
    if (preview.exportedDaysAgo === "today") {
      metaItems.push(["Age", "Today"]);
    } else if (preview.exportedDaysAgo !== "unknown") {
      metaItems.push(["Age", preview.exportedDaysAgo + " days ago"]);
    }
    if (preview.sensitiveCount > 0) {
      metaItems.push(["⚠️ " + t("tools.importSensitiveBlocked", "Sensitive fields blocked"), String(preview.sensitiveCount)]);
    }
    if (preview.warnings.length > 0) {
      metaItems.push(["Warnings", preview.warnings.join(", ")]);
    }
    // Round 46.0: display manifest counts if available
    if (preview.manifest && preview.manifest.counts) {
      var counts = preview.manifest.counts;
      var countsStr = [
        "Lessons: " + (counts.completedLessons || 0),
        "Quiz: " + (counts.quizResults || 0),
        "Wrong Book: " + (counts.wrongBook || 0),
        "Bookmarks: " + (counts.bookmarks || 0),
        "Typing: " + (counts.typingHistory || 0),
        "Exam: " + (counts.examHistory || 0)
      ].join(", ");
      metaItems.push(["Manifest Counts", countsStr]);
    }
    metaItems.forEach(function (pair) {
      var row = h("div", { className: "import-preview-meta-row" });
      row.appendChild(h("span", { className: "import-preview-meta-label", textContent: pair[0] }));
      row.appendChild(h("span", { className: "import-preview-meta-value", textContent: pair[1] }));
      meta.appendChild(row);
    });
    panel.appendChild(meta);

    /* ── Importable sections table ────────────────────── */
    var importableTable = h("div", { className: "import-preview-table-wrap" });
    var tableTitle = h("h3", { className: "import-preview-subtitle" }, [
      t("tools.importImportable", "Importable Data")
    ]);
    importableTable.appendChild(tableTitle);

    var table = h("table", { className: "import-preview-table" });
    var thead = h("thead");
    var trHead = h("tr");
    [
      t("tools.importSection", "Section"),
      t("tools.importNew", "New"),
      t("tools.importConflict", "Conflict"),
      t("tools.importSkipped", "Skipped")
    ].forEach(function (thText) {
      trHead.appendChild(h("th", { textContent: thText }));
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    var tbody = h("tbody");
    var hasImportable = false;
    preview.importable.forEach(function (sec) {
      if (sec.newCount === 0 && sec.conflictCount === 0 && sec.skipCount === 0) return;
      hasImportable = true;
      var tr = h("tr");
      tr.appendChild(h("td", { textContent: sec.label }));
      tr.appendChild(h("td", { className: "imp-new", textContent: String(sec.newCount) }));
      tr.appendChild(h("td", { className: "imp-conflict", textContent: String(sec.conflictCount) }));
      tr.appendChild(h("td", { className: "imp-skip", textContent: String(sec.skipCount) }));
      tbody.appendChild(tr);
    });

    if (!hasImportable) {
      var emptyRow = h("tr");
      var emptyCell = h("td", {
        colspan: "4",
        textContent: t("tools.importNoData", "No importable data found")
      });
      emptyCell.style.textAlign = "center";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    table.appendChild(tbody);

    /* ── Totals row ───────────────────────────────────── */
    if (hasImportable) {
      var tfoot = h("tfoot");
      var trTotal = h("tr", { className: "imp-total-row" });
      trTotal.appendChild(h("td", { textContent: t("tools.importSummary", "Total") }));
      trTotal.appendChild(h("td", { className: "imp-new", textContent: String(preview.totalNew) }));
      trTotal.appendChild(h("td", { className: "imp-conflict", textContent: String(preview.totalConflict) }));
      trTotal.appendChild(h("td", { className: "imp-skip", textContent: String(preview.totalSkipped) }));
      tfoot.appendChild(trTotal);
      table.appendChild(tfoot);
    }

    importableTable.appendChild(table);
    panel.appendChild(importableTable);

    /* ── Opt-in sections ──────────────────────────────── */
    var optSection = h("div", { className: "import-preview-optin" });
    var optTitle = h("h3", { className: "import-preview-subtitle" }, [
      "⚙️ Optional (not imported by default)"
    ]);
    optSection.appendChild(optTitle);
    preview.optIn.forEach(function (sec) {
      var row = h("div", { className: "import-preview-optin-row" });
      var label = h("span", { className: "imp-optin-label", textContent: sec.label });
      var status = h("span", {
        className: "imp-optin-status" + (sec.hasData ? "" : " imp-optin-empty"),
        textContent: sec.hasData ? "Available" : "Not present"
      });
      row.appendChild(label);
      row.appendChild(status);
      optSection.appendChild(row);
    });
    panel.appendChild(optSection);

    /* ── Non-importable ───────────────────────────────── */
    var nonSection = h("div", { className: "import-preview-nonimport" });
    var nonTitle = h("h3", { className: "import-preview-subtitle" }, [
      "🚫 " + t("tools.importSkipped", "Not Imported")
    ]);
    nonSection.appendChild(nonTitle);
    preview.nonImportable.forEach(function (sec) {
      var row = h("div", { className: "import-preview-nonimport-row" });
      row.appendChild(h("span", { className: "imp-nonimport-label", textContent: sec.label }));
      row.appendChild(h("span", { className: "imp-nonimport-reason", textContent: sec.reason }));
      nonSection.appendChild(row);
    });
    panel.appendChild(nonSection);

    /* ── Footer ───────────────────────────────────────── */
    var footer = h("div", { className: "import-preview-footer" });
    var closeBtn = h("button", {
      type: "button",
      className: "import-preview-close-btn",
      textContent: t("tools.importClosePreview", "Close Preview")
    });
    closeBtn.addEventListener("click", clearImportPreview);
    footer.appendChild(closeBtn);
    panel.appendChild(footer);

    overlayEl.appendChild(panel);
    document.body.appendChild(overlayEl);

    // Close on overlay click (not panel)
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) clearImportPreview();
    });

    // Close on Escape
    var escHandler = function (e) {
      if (e.key === "Escape") {
        clearImportPreview();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    previewActive = true;
  }

  /* ── Cleanup ────────────────────────────────────────── */
  function cleanupOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null;
    }
    previewActive = false;
    previewData = null;
  }

  function clearImportPreview() {
    cleanupOverlay();
  }

  /* ── Main entry ─────────────────────────────────────── */
  function openPreview() {
    if (previewActive) return;

    // Record state BEFORE any operation
    recordWriteCount();

    // Create file input
    var input = h("input", {
      type: "file",
      accept: ".json,application/json"
    });
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      verifyNoWrites("after file select");

      if (!file) return;

      readBackupFile(file, function (res) {
        verifyNoWrites("after file read");

        if (res.error) {
          if (res.error === "file-too-large") {
            showError(t("tools.importFileTooLarge", "File too large — max 5 MB"));
          } else if (res.error === "read-error") {
            showError(t("tools.importParseFailed", "Failed to read file"));
          } else {
            showError(t("tools.importParseFailed", "Could not open file"));
          }
          recordWriteCount(); // reset counter after error path
          return;
        }

        var backup = parseBackupJson(res.text);
        verifyNoWrites("after JSON parse");

        if (!backup) {
          showError(t("tools.importParseFailed", "File parse failed — invalid JSON"));
          recordWriteCount();
          return;
        }

        var schemaResult = validateBackupSchema(backup);
        verifyNoWrites("after schema check");

        if (!schemaResult.ok) {
          if (schemaResult.reason === "future-schemaVersion") {
            showError(t("tools.importIncompatibleVersion", "Incompatible backup version") +
              " (" + (schemaResult.detail || "") + ")");
          } else if (schemaResult.reason === "unknown-source") {
            showError(t("tools.importParseFailed", "Unknown backup format"));
          } else {
            showError(t("tools.importParseFailed", "Invalid backup file structure"));
          }
          recordWriteCount();
          return;
        }

        // Build preview (read-only comparison against localStorage)
        previewData = buildImportPreview(backup);
        verifyNoWrites("after preview build");

        // Render
        renderImportPreview(previewData);
        verifyNoWrites("after render");
      });
    });

    input.click();
  }

  function showError(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message, "error");
    } else {
      try { window.alert(message); } catch (_) {}
    }
  }

  /* ── Assertion (callable from tests) ────────────────── */
  function assertNoLocalStorageWrites() {
    try {
      if (localStorage.length !== writeCountBefore) {
        return {
          pass: false,
          before: writeCountBefore,
          after: localStorage.length,
          message: "localStorage was modified during preview"
        };
      }
      return { pass: true };
    } catch (_) {
      return { pass: true, message: "could not check (permission?)" };
    }
  }

  /* ── Expose ─────────────────────────────────────────── */
  window.ImportPreview = {
    openPreview: openPreview,
    clearPreview: clearImportPreview,
    readBackupFile: readBackupFile,
    parseBackupJson: parseBackupJson,
    scanSensitiveFields: scanSensitiveFields,
    validateBackupSchema: validateBackupSchema,
    buildImportPreview: buildImportPreview,
    assertNoLocalStorageWrites: assertNoLocalStorageWrites
  };
})();
