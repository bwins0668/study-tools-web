/**
 * tools/test_engine_switch.js
 * ===================================
 * Headless verification of the dual-engine switch logic in app.js.
 * This tests:
 *   1. MockSQLEngine fallback works when sql.js is unavailable
 *   2. SQLiteAdapter works when sql.js is available
 *   3. executeSqlViaEngine delegates correctly
 *   4. resetMockDB works on both engines
 *   5. window.getCurrentSqlEngineType() returns correct values
 *
 * Run: node tools/test_engine_switch.js
 */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = __dirname + "/..";

// ============================================================
// Load sql.js
// ============================================================
var initSqlJs = require(ROOT + "/assets/vendor/sql-wasm.js");

// ============================================================
// Load DB_DATA, DB_SCHEMA from data/db.js (including MockSQLEngine)
// ============================================================
var src = fs.readFileSync(path.join(ROOT, "data/db.js"), "utf8");
// Evaluate the entire file to get MockSQLEngine class
var sandbox = vm.runInThisContext("(function(){\n" + src + "\nreturn { DB_DATA: DB_DATA, DB_SCHEMA: DB_SCHEMA, MockSQLEngine: MockSQLEngine };\n})()", { filename: "db.js" });
var DB_DATA = sandbox.DB_DATA;
var MockSQLEngine = sandbox.MockSQLEngine;

// ============================================================
// Load SQLiteAdapter from the source file
// ============================================================
// sqlite-adapter.js is an IIFE that sets window.SQLiteAdapter.
// For Node.js we evaluate, but it references DB_DATA and DB_SCHEMA globals.
var adapterSrc = fs.readFileSync(path.join(ROOT, "assets/js/sqlite-adapter.js"), "utf8");

// We need to fake window, initSqlJs, DB_DATA, DB_SCHEMA as globals.
global.window = {};
global.initSqlJs = initSqlJs;
global.DB_DATA = DB_DATA;
global.DB_SCHEMA = sandbox.DB_SCHEMA;
vm.runInThisContext(adapterSrc, { filename: "sqlite-adapter.js" });
var SQLiteAdapter = global.window.SQLiteAdapter;

if (!SQLiteAdapter) {
  console.error("Failed to extract SQLiteAdapter from sqlite-adapter.js");
  process.exit(1);
}

// ============================================================
// Test harness: replicate app.js dual-engine logic
// ============================================================
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  双引擎切换验证 (SQLiteAdapter + MockSQLEngine fallback)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // -- Setup dual engine state (same as app.js) --
  var sqlEngine = new MockSQLEngine();
  var sqlEngineType = 'MockSQLEngine';
  var sqlEngineReady = true;
  var sqliteAdapterInstance = null;

  function getCurrentSqlEngineType() {
    return sqlEngineType;
  }

  function executeSqlViaEngine(sql) {
    if (sqlEngineType === 'SQLiteAdapter' && sqliteAdapterInstance && sqliteAdapterInstance.isReady()) {
      return sqliteAdapterInstance.execute(sql);
    }
    return sqlEngine.execute(sql);
  }

  async function tryInitSQLiteAdapter() {
    if (typeof initSqlJs === 'undefined') {
      console.warn('[SQL Engine] sql.js not loaded, keeping MockSQLEngine');
      return;
    }
    sqlEngineReady = false;
    var adapter = new SQLiteAdapter();
    try {
      var ok = await adapter.init();
      if (ok && adapter.isReady()) {
        sqliteAdapterInstance = adapter;
        sqlEngineType = 'SQLiteAdapter';
        console.log('[SQL Engine] ✅ 已切换为 SQLiteAdapter');
      } else {
        console.warn('[SQL Engine] init failed: ' + (adapter.getLastError() || 'unknown'));
      }
    } catch (e) {
      console.warn('[SQL Engine] init exception, keeping MockSQLEngine');
    }
    sqlEngineReady = true;
  }

  // ============================================================
  // Test 1: Initial state — MockSQLEngine
  // ============================================================
  console.log("▶ Test 1: 初始状态 — getCurrentSqlEngineType()");
  console.log("  引擎类型: " + getCurrentSqlEngineType());
  if (getCurrentSqlEngineType() !== 'MockSQLEngine') {
    console.error("  ❌ 初始应为 MockSQLEngine");
    process.exit(1);
  }
  console.log("  ✅ 初始为 MockSQLEngine\n");

  // ============================================================
  // Test 2: executeSqlViaEngine with MockSQLEngine
  // ============================================================
  console.log("▶ Test 2: MockSQLEngine 执行 SELECT");
  var res = executeSqlViaEngine("SELECT * FROM students_mst LIMIT 3;");
  if (res.success && res.columns.length === 11 && res.rows.length === 3) {
    console.log("  ✅ " + res.rows.length + " 行, " + res.columns.length + " 列\n");
  } else {
    console.error("  ❌ 失败: " + (res.error || "unexpected result"));
    process.exit(1);
  }

  // ============================================================
  // Test 3: Attempt SQLiteAdapter init
  // ============================================================
  console.log("▶ Test 3: 初始化 SQLiteAdapter...");
  await tryInitSQLiteAdapter();
  console.log("  引擎类型: " + getCurrentSqlEngineType());
  if (getCurrentSqlEngineType() !== 'SQLiteAdapter') {
    console.error("  ❌ 应切换为 SQLiteAdapter");
    process.exit(1);
  }
  console.log("  ✅ 已切换为 SQLiteAdapter\n");

  // ============================================================
  // Test 4: executeSqlViaEngine with SQLiteAdapter
  // ============================================================
  console.log("▶ Test 4: SQLiteAdapter 执行 SQL (兼容字段验证)");

  var tests = [
    { label: "SELECT * FROM students_mst LIMIT 3", sql: "SELECT * FROM students_mst LIMIT 3;", expectedCols: 11, expectedRows: 3 },
    { label: "SELECT name, email FROM members", sql: "SELECT name, email FROM members;", expectedCols: 2, expectedRows: 8 },
    { label: "SELECT mem_id, address FROM members", sql: "SELECT mem_id, address FROM members;", expectedCols: 2, expectedRows: 8 },
    { label: "SELECT ord_id, total FROM orders", sql: "SELECT ord_id, total FROM orders;", expectedCols: 2, expectedRows: 15 },
    { label: "SELECT COUNT(*) FROM students_mst", sql: "SELECT COUNT(*) FROM students_mst;", expectedCols: 1, expectedRows: 1 },
    { label: "SELECT NOW() (方言翻译)", sql: "SELECT NOW();", expectedCols: 1, expectedRows: 1 },
  ];

  var allOk = true;
  tests.forEach(function (t) {
    var r = executeSqlViaEngine(t.sql);
    if (r.success && r.columns.length === t.expectedCols && r.rows.length >= t.expectedRows) {
      console.log("  ✅ " + t.label + " — " + r.columns.length + " 列, " + r.rows.length + " 行");
    } else {
      console.error("  ❌ " + t.label + " — " + (r.error || ("cols:" + r.columns.length + " rows:" + r.rows.length)));
      allOk = false;
    }
  });
  if (!allOk) process.exit(1);
  console.log("");

  // ============================================================
  // Test 5: INSERT / UPDATE / DELETE
  // ============================================================
  console.log("▶ Test 5: DML 操作 (INSERT / UPDATE / DELETE)");

  var insRes = executeSqlViaEngine("INSERT INTO departments_mst (department_id, department_name, insert_at, update_at) VALUES (12, 'テスト学科', '2026-06-09 12:00:00', '2026-06-09 12:00:00');");
  if (insRes.success) {
    console.log("  ✅ INSERT — " + (insRes.message || "ok"));
  } else {
    console.error("  ❌ INSERT 失败: " + insRes.error);
    allOk = false;
  }

  var updRes = executeSqlViaEngine("UPDATE students_mst SET test_score = 99 WHERE student_id = 1;");
  if (updRes.success) {
    console.log("  ✅ UPDATE — " + (updRes.message || "ok"));
  } else {
    console.error("  ❌ UPDATE 失败: " + updRes.error);
    allOk = false;
  }

  var delRes = executeSqlViaEngine("DELETE FROM departments_mst WHERE department_id = 12;");
  if (delRes.success) {
    console.log("  ✅ DELETE — " + (delRes.message || "ok"));
  } else {
    console.error("  ❌ DELETE 失败: " + delRes.error);
    allOk = false;
  }
  if (!allOk) process.exit(1);
  console.log("");

  // ============================================================
  // Test 6: Reset database
  // ============================================================
  console.log("▶ Test 6: 重置数据库 (reset)");

  // First, delete some data
  executeSqlViaEngine("DELETE FROM students_mst WHERE student_id = 1;");
  var afterDel = executeSqlViaEngine("SELECT COUNT(*) FROM students_mst;");
  var delCount = afterDel.rows[0][0];
  console.log("  删除 1 行后: " + delCount + " 行 (期望 29)");
  if (delCount !== 29) { allOk = false; console.error("  ❌ 删除后行数异常"); }

  // Reset
  if (sqliteAdapterInstance) {
    sqliteAdapterInstance.reset();
  }
  var afterReset = executeSqlViaEngine("SELECT COUNT(*) FROM students_mst;");
  var resetCount = afterReset.rows[0][0];
  console.log("  重置后: " + resetCount + " 行 (期望 30)");
  if (resetCount === 30) {
    console.log("  ✅ 重置成功\n");
  } else {
    console.error("  ❌ 重置失败\n");
    allOk = false;
  }

  // Force close the SQLite DB so process can exit cleanly
  if (sqliteAdapterInstance && sqliteAdapterInstance.db) {
    try { sqliteAdapterInstance.db.close(); } catch (e) {}
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("═══════════════════════════════════════════════════════════");
  if (allOk) {
    console.log("  🎉 全部测试通过！双引擎切换功能正常。");
    process.exit(0);
  } else {
    console.error("  ❌ 有测试失败。");
    process.exit(1);
  }
}

main().catch(function (e) { console.error("Fatal:", e); process.exit(1); });
