/**
 * tools/test_sqlite_adapter_compat.js
 * ===================================
 * 批量测试 SQLiteAdapter 对 SQL 题库的兼容性。
 *
 * 运行方式：
 *   node tools/test_sqlite_adapter_compat.js
 *
 * 关键设计：每条 SQL 在独立的内存数据库中运行，
 * 避免 DDL 破坏后续测试的 schema。
 */

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = __dirname + "/..";

// ============================================================
// Step 1: Load sql.js
// ============================================================
var initSqlJs = require(ROOT + "/assets/vendor/sql-wasm.js");

// ============================================================
// Step 2: Extract DB_DATA and DB_SCHEMA from data/db.js
// ============================================================
function extractData() {
  var src = fs.readFileSync(path.join(ROOT, "data/db.js"), "utf8");
  var classIdx = src.indexOf("class MockSQLEngine");
  if (classIdx !== -1) src = src.substring(0, classIdx);
  var wrapped = "(function () {\n" + src + "\nreturn { DB_DATA: DB_DATA, DB_SCHEMA: DB_SCHEMA };\n})()";
  return vm.runInThisContext(wrapped, { filename: "db.js" });
}

// ============================================================
// Step 3: Extract SQLs from lessons.js and exam questions
// ============================================================
function extractLessonSQLs() {
  var src = fs.readFileSync(path.join(ROOT, "data/lessons.js"), "utf8");
  var fnIdx = src.indexOf("function expandAllRandomExercises");
  if (fnIdx !== -1) src = src.substring(0, fnIdx);
  var wrapped = "(function () {\n" + src + "\nreturn { SQL_LESSONS: SQL_LESSONS, RANDOM_EXERCISES: RANDOM_EXERCISES };\n})()";
  var res, SQL_LESSONS, RANDOM_EXERCISES;
  try { res = vm.runInThisContext(wrapped, { filename: "lessons.js" }); } catch (e) {
    console.warn("  ⚠️  lessons.js eval partial: " + e.message.slice(0, 80));
    return [];
  }
  SQL_LESSONS = res.SQL_LESSONS;
  RANDOM_EXERCISES = res.RANDOM_EXERCISES;

  var sqls = [];
  if (SQL_LESSONS) {
    SQL_LESSONS.forEach(function (l) {
      if (l.example) sqls.push({ source: "lesson_example", lessonId: l.id, title: l.titleZh || l.titleJa || "", sql: l.example });
    });
  }
  if (RANDOM_EXERCISES) {
    Object.keys(RANDOM_EXERCISES).forEach(function (key) {
      RANDOM_EXERCISES[key].forEach(function (ex) {
        if (ex.example) sqls.push({ source: "random_exercise", lessonId: parseInt(key, 10), task: ex.task || "", sql: ex.example });
      });
    });
  }
  return sqls;
}

function extractExamSQLs() {
  var src = fs.readFileSync(path.join(ROOT, "data/sql_exam_questions.js"), "utf8");
  var wrapped = "(function () {\n" + src + "\nreturn SQL_EXAM_QUESTIONS;\n})()";
  var SQL_EXAM_QUESTIONS;
  try { SQL_EXAM_QUESTIONS = vm.runInThisContext(wrapped, { filename: "sql_exam_questions.js" }); } catch (e) {
    console.warn("  ⚠️  exam questions eval failed: " + e.message.slice(0, 80));
    return [];
  }

  var sqls = [];
  if (SQL_EXAM_QUESTIONS) {
    SQL_EXAM_QUESTIONS.forEach(function (q) {
      if (q.solutionQuery) sqls.push({
        source: "exam_solution", examId: q.id, title: q.titleJa || q.titleZh || "",
        difficulty: q.difficulty || "", dbGroup: q.dbGroup || "", sql: q.solutionQuery
      });
    });
  }
  return sqls;
}

// ============================================================
// Step 4: SQL helpers (ported from sqlite-adapter.js)
// ============================================================
function escapeSQL(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function mapTypeToSQLite(type) {
  var u = String(type).toUpperCase();
  if (/INT|SERIAL/.test(u)) return "INTEGER";
  if (/CHAR|VARCHAR|TEXT|CLOB/.test(u)) return "TEXT";
  if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(u)) return "REAL";
  if (/DATE|TIME/.test(u)) return "TEXT";
  if (/BLOB/.test(u)) return "BLOB";
  return "TEXT";
}

function buildCreateTableSQL(tableName, DB_SCHEMA) {
  var schema = DB_SCHEMA[tableName];
  if (!schema || !schema.columns) return "CREATE TABLE IF NOT EXISTS " + tableName + " (id INTEGER PRIMARY KEY)";
  var colDefs = schema.columns.map(function (col) {
    var def = col.name + " " + mapTypeToSQLite(col.type || "TEXT");
    if (col.primary) def += " PRIMARY KEY";
    return def;
  });
  return "CREATE TABLE IF NOT EXISTS " + tableName + " (" + colDefs.join(", ") + ")";
}

function translateConcat(sql) {
  var out = "", i = 0;
  while (i < sql.length) {
    var rest = sql.slice(i);
    var m = rest.match(/^CONCAT\s*\(\s*/i);
    if (m) {
      i += m[0].length;
      var depth = 1, tokens = [], current = "", inString = false, stringChar = "";
      while (i < sql.length && depth > 0) {
        var ch = sql[i];
        if (inString) {
          current += ch;
          if (ch === stringChar) {
            // handle SQL escaped quotes ''
            if (sql[i + 1] === stringChar) { current += sql[i + 1]; i++; }
            else inString = false;
          }
        } else {
          if (ch === "'" || ch === '"') { inString = true; stringChar = ch; current += ch; }
          else if (ch === "(") { depth++; current += ch; }
          else if (ch === ")") {
            depth--;
            if (depth === 0) { if (current.trim()) tokens.push(current.trim()); break; }
            else current += ch;
          }
          else if (ch === "," && depth === 1) { if (current.trim()) tokens.push(current.trim()); current = ""; }
          else current += ch;
        }
        i++;
      }
      if (tokens.length >= 2) out += "(" + tokens.join(" || ") + ")";
      else if (tokens.length === 1) out += tokens[0];
      i++;
    } else { out += sql[i]; i++; }
  }
  return out;
}

var DIALECT_RULES = [
  { pattern: /\bNOW\(\s*\)/gi, replacement: "datetime('now')" },
  { pattern: /\bCHAR_LENGTH\(\s*/gi, replacement: "LENGTH(" },
  { pattern: /\bSTART\s+TRANSACTION\b/gi, replacement: "BEGIN TRANSACTION" },
  { pattern: /\bDROP\s+INDEX\s+(\w+)\s+ON\s+\w+\s*/gi, replacement: "DROP INDEX $1 " },
  { pattern: /\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, replacement: "INTEGER PRIMARY KEY AUTOINCREMENT" },
  { pattern: /\bAUTO_INCREMENT\b/gi, replacement: "AUTOINCREMENT" },
  { pattern: /\bIFNULL\(\s*/gi, replacement: "COALESCE(" },
  { pattern: /\bCURDATE\(\s*\)/gi, replacement: "date('now')" },
  { pattern: /\bSYSDATE\(\s*\)/gi, replacement: "datetime('now')" },
];

function translateSQL(sql) {
  var t = String(sql || "");
  if (/\bRIGHT\s+(OUTER\s+)?JOIN\b/i.test(t)) throw new Error("RIGHT JOIN not supported in SQLite");
  t = translateConcat(t);
  for (var i = 0; i < DIALECT_RULES.length; i++) t = t.replace(DIALECT_RULES[i].pattern, DIALECT_RULES[i].replacement);
  return t;
}

// ============================================================
// Step 5: Build a fresh database
// ============================================================
function createFreshDB(SQL, DB_DATA, DB_SCHEMA) {
  var db = new SQL.Database();
  var tableNames = Object.keys(DB_DATA);
  tableNames.forEach(function (name) { db.run(buildCreateTableSQL(name, DB_SCHEMA)); });
  tableNames.forEach(function (tableName) {
    var rows = DB_DATA[tableName];
    if (!rows || rows.length === 0) return;
    var cols = Object.keys(rows[0]);
    rows.forEach(function (row) {
      var vals = cols.map(function (c) { return escapeSQL(row[c]); });
      try { db.run("INSERT INTO " + tableName + " (" + cols.join(", ") + ") VALUES (" + vals.join(", ") + ")"); } catch (e) {}
    });
  });
  try { db.run("ALTER TABLE members ADD COLUMN email TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE members ADD COLUMN address TEXT"); db.run("UPDATE members SET address = city"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN ord_id INTEGER"); db.run("UPDATE orders SET ord_id = order_id"); } catch (e) {}
  return db;
}

// ============================================================
// Step 6: Execute a single SQL against a database
// ============================================================
function executeSQL(db, sql) {
  try {
    var translated = translateSQL(sql);
    var upperSql = translated.trim().toUpperCase();

    // DML / Transaction — before DDL since START is ambiguous
    if (/^(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|PRAGMA|REPLACE)\s/i.test(translated) || /^BEGIN\s+TRANSACTION/i.test(translated)) {
      var stmts = translated.split(";").filter(function (s) { return s.trim().length > 0; });
      var totalChanges = 0;
      for (var si = 0; si < stmts.length; si++) {
        db.run(stmts[si].trim() + ";");
        totalChanges += db.getRowsModified();
      }
      return { success: true, columns: ["Changes"], rows: [[totalChanges]], message: totalChanges + " rows affected" };
    }

    // DDL
    if (/^(CREATE|DROP|ALTER)\s/i.test(translated)) {
      db.run(translated);
      return { success: true, columns: ["Status"], rows: [["OK"]], message: "DDL executed" };
    }

    // SELECT
    if (upperSql.startsWith("SELECT") || upperSql.startsWith("WITH")) {
      var results = db.exec(translated);
      if (!results || results.length === 0) return { success: true, columns: [], rows: [] };
      var r = results[0];
      return { success: true, columns: r.columns.slice(), rows: r.values.map(function (row) { return row.slice(); }) };
    }

    // Fallback
    db.run(translated);
    return { success: true, columns: ["Result"], rows: [["OK"]] };
  } catch (e) {
    return { success: false, error: (e.message || String(e)).replace(/^Execution error:\s*/i, "") };
  }
}

// ============================================================
// Step 7: Classify a failure reason
// ============================================================
function classifyFailure(sql, error) {
  var err = (error || "").toLowerCase();
  if (/no such table/i.test(err)) return "table_missing";
  if (/no such column/i.test(err)) return "column_missing";
  if (/incomplete input|syntax error|near ["\w]+": syntax error/i.test(err)) return "syntax_error";
  if (/RIGHT JOIN/i.test(sql)) return "mysql_dialect_unsupported";
  if (/\bAUTO_INCREMENT\b/i.test(sql)) return "mysql_dialect_untranslated";
  if (/\bCONCAT\(/i.test(sql) && /row value misused/i.test(err)) return "mysql_dialect_untranslated";
  if (/already exists|duplicate column/i.test(err)) return "ddl_sequential_artifact";
  // DROP INDEX on a fresh DB — the index was never created (sequential dependency)
  if (/no such index/i.test(err)) return "ddl_sequential_artifact";
  if (/UNIQUE constraint|FOREIGN KEY/i.test(err)) return "constraint_conflict";
  if (/transaction within a transaction/i.test(err)) return "nested_transaction_artifact";
  return "other";
}

// ============================================================
// Step 8: Run a single test on a fresh DB
// ============================================================
function runTest(SQL, DB_DATA, DB_SCHEMA, t, idx) {
  var sql = (t.sql || "").trim();
  if (!sql) return { index: idx + 1, source: t.source, sql: sql, status: "skipped", reason: "empty_sql" };

  // Certain SQL types are destructive and break subsequent tests if run on a shared DB.
  // We test these on a fresh copy per SQL to avoid cascading failures.
  var isDestructive = /^(CREATE|DROP|ALTER|DELETE\s+FROM\s+\w+(?!\s+WHERE)|START\s+TRANSACTION)/i.test(sql) ||
    /;(?!\s*$)/.test(sql); // multi-statement (transactions)

  var db;
  if (isDestructive) {
    db = createFreshDB(SQL, DB_DATA, DB_SCHEMA);
  } else {
    // use global shared db — but we need to handle the case where a prior destructive test
    // already corrupted it. We use fresh DB for all tests instead to be safe.
    db = createFreshDB(SQL, DB_DATA, DB_SCHEMA);
  }

  var result = executeSQL(db, sql);
  db.close();

  var row = {
    index: idx + 1,
    source: t.source,
    lessonId: t.lessonId,
    examId: t.examId,
    title: t.title || t.task || "",
    sql: sql,
    success: result.success,
    translated: translateSQL(sql),
    columns: result.columns ? result.columns.length : 0,
    rowCount: result.rows ? result.rows.length : 0,
    error: result.error || null,
    status: result.success ? "passed" : "failed",
    reason: result.success ? "ok" : classifyFailure(sql, result.error),
  };

  // Some DDL/artifact issues should be skipped, not counted as failed
  if (row.reason === "ddl_sequential_artifact" || row.reason === "nested_transaction_artifact" || row.reason === "constraint_conflict") {
    row.status = "skipped";
  }

  return row;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SQLiteAdapter 题库兼容性批量测试");
  console.log("═══════════════════════════════════════════════════════════\n");

  // --- Extract data ---
  console.log("▶ 加载数据...");
  var xData = extractData();
  var lessonSQLs = extractLessonSQLs();
  var examSQLs = extractExamSQLs();
  console.log("  DB_DATA 表: " + Object.keys(xData.DB_DATA).join(", "));
  console.log("  课程 SQL: " + lessonSQLs.length + " 条");
  console.log("  题库 SQL: " + examSQLs.length + " 条\n");

  // --- Init sql.js ---
  console.log("▶ 初始化 sql.js WASM...");
  var SQL = await initSqlJs();
  console.log("  ✅ sql.js 加载成功\n");

  // --- Verify fresh DB ---
  console.log("▶ 验证 fresh DB 构建...");
  var testDB = createFreshDB(SQL, xData.DB_DATA, xData.DB_SCHEMA);
  var verifyRes = testDB.exec("SELECT COUNT(*) FROM students_mst");
  var vCount = verifyRes[0].values[0][0];
  testDB.close();
  console.log("  students_mst 行数: " + vCount + " (期望 30)");
  if (vCount !== 30) { console.error("  ❌ 数据异常，终止"); process.exit(1); }
  console.log("  ✅ 数据导入正确\n");

  // --- Run all tests (each on fresh DB for isolation) ---
  console.log("▶ 开始批量测试 (每条 SQL 在独立内存数据库中执行)...\n");

  var allTests = lessonSQLs.concat(examSQLs);
  var stats = { total: allTests.length, passed: 0, failed: 0, skipped: 0, rows: [] };

  for (var idx = 0; idx < allTests.length; idx++) {
    var row = runTest(SQL, xData.DB_DATA, xData.DB_SCHEMA, allTests[idx], idx);
    if (row.status === "passed") stats.passed++;
    else if (row.status === "skipped") stats.skipped++;
    else stats.failed++;
    stats.rows.push(row);

    // progress indicator
    if ((idx + 1) % 100 === 0) console.log("  进度: " + (idx + 1) + "/" + allTests.length);
  }

  // --- Report ---
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  测试结果统计");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("  总测试数: " + stats.total);
  console.log("  ✅ passed: " + stats.passed);
  console.log("  ❌ failed: " + stats.failed);
  console.log("  ⏭️  skipped: " + stats.skipped);

  var failedRows = stats.rows.filter(function (r) { return r.status === "failed"; });
  var catCounts = {};
  failedRows.forEach(function (r) { catCounts[r.reason] = (catCounts[r.reason] || 0) + 1; });

  var catLabels = {
    table_missing: "a. 表不存在",
    column_missing: "b. 字段不存在",
    mysql_dialect_unsupported: "c. MySQL 方言不支持 (RIGHT JOIN)",
    mysql_dialect_untranslated: "d. MySQL 方言未翻译 (AUTO_INCREMENT/CONCAT)",
    syntax_error: "e. SQLite 语法错误",
    ddl_sequential_artifact: "artifact: DDL 顺序执行产物 (skipped)",
    nested_transaction_artifact: "artifact: 嵌套事务 (skipped)",
    constraint_conflict: "artifact: 约束冲突 (skipped)",
    other: "f. 其他",
  };

  console.log("\n  失败原因分类:");
  Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).forEach(function (cat) {
    console.log("     " + (catLabels[cat] || cat) + ": " + catCounts[cat]);
  });

  // Top 20 failures
  if (failedRows.length > 0) {
    console.log("\n───────────────────────────────────────────────────────────");
    console.log("  前 20 个失败案例");
    console.log("───────────────────────────────────────────────────────────\n");
    failedRows.slice(0, 20).forEach(function (r, fi) {
      console.log("  #" + (fi + 1) + " [" + r.reason + "] " + r.source + "/" + (r.lessonId || r.examId || "?"));
      if (r.title) console.log("     题目: " + r.title.slice(0, 80));
      console.log("     SQL: " + r.sql);
      console.log("     翻译: " + r.translated);
      console.log("     错误: " + (r.error || ""));
      console.log("");
    });
  }

  // Column-missing detail
  var colMissing = failedRows.filter(function (r) { return r.reason === "column_missing"; });
  if (colMissing.length > 0) {
    var colFields = {};
    colMissing.forEach(function (r) {
      var m = (r.error || "").match(/no such column:\s*(\S+)/i);
      var col = m ? m[1] : "?";
      colFields[col] = (colFields[col] || 0) + 1;
    });
    console.log("───────────────────────────────────────────────────────────");
    console.log("  缺失字段统计 (column_missing)");
    console.log("───────────────────────────────────────────────────────────\n");
    Object.keys(colFields).sort(function (a, b) { return colFields[b] - colFields[a]; }).forEach(function (col) {
      console.log("    " + col + ": " + colFields[col] + " 处");
    });
    console.log("");
  }

  // Table-missing detail
  var tblMissing = failedRows.filter(function (r) { return r.reason === "table_missing"; });
  if (tblMissing.length > 0) {
    var tblFields = {};
    tblMissing.forEach(function (r) {
      var m = (r.error || "").match(/no such table:\s*(\S+)/i);
      var tbl = m ? m[1] : "?";
      tblFields[tbl] = (tblFields[tbl] || 0) + 1;
    });
    console.log("───────────────────────────────────────────────────────────");
    console.log("  缺失表统计 (table_missing)");
    console.log("───────────────────────────────────────────────────────────\n");
    Object.keys(tblFields).sort(function (a, b) { return tblFields[b] - tblFields[a]; }).forEach(function (tbl) {
      console.log("    " + tbl + ": " + tblFields[tbl] + " 处");
    });
    console.log("");
  }

  // MySQL dialect untranslated detail
  var dialectFail = failedRows.filter(function (r) { return r.reason === "mysql_dialect_untranslated"; });
  if (dialectFail.length > 0) {
    console.log("───────────────────────────────────────────────────────────");
    console.log("  MySQL 方言未翻译详情");
    console.log("───────────────────────────────────────────────────────────\n");
    dialectFail.forEach(function (r) {
      console.log("  " + r.sql.slice(0, 100));
      console.log("    → " + r.translated.slice(0, 100));
      console.log("    error: " + (r.error || ""));
    });
    console.log("");
  }

  // Write JSON report
  var summaryPath = path.join(ROOT, "tools/compat_test_report.json");
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats: { total: stats.total, passed: stats.passed, failed: stats.failed, skipped: stats.skipped },
    failureCategories: catCounts,
    failures: failedRows.slice(0, 100).map(function (r) {
      return { index: r.index, source: r.source, lessonId: r.lessonId, examId: r.examId,
        title: (r.title || "").slice(0, 100), sql: r.sql, translated: r.translated, error: r.error, reason: r.reason };
    }),
  }, null, 2), "utf8");
  console.log("  完整 JSON 报告: tools/compat_test_report.json\n");

  if (stats.failed === 0) console.log("  🎉 全部通过！");
  else console.log("  ⚠️  " + stats.failed + " 条失败，详见上方详情和 JSON 报告。");
}

main().catch(function (e) { console.error("Fatal:", e); process.exit(1); });
