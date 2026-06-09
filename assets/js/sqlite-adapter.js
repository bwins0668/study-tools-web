/**
 * SQLiteAdapter — sql.js / SQLite WASM 适配器骨架
 * ===============================================
 * 为 SQL Learning Hub 提供基于真实 SQLite 引擎的 SQL 执行能力。
 * 保持与 MockSQLEngine 完全兼容的返回格式。
 *
 * 依赖：
 *   - data/db.js (DB_DATA, DB_SCHEMA) — 必须在 adapter 之前加载
 *   - assets/vendor/sql-wasm.js — sql.js 主库（当前阶段可选，加载逻辑已预留）
 *   - assets/vendor/sql-wasm.wasm — SQLite WebAssembly 二进制
 *
 * 使用方式：
 *   const adapter = new SQLiteAdapter();
 *   await adapter.init();
 *   const result = adapter.execute("SELECT * FROM students_mst;");
 *
 * 本阶段 (3B-1)：
 *   - 不替换 app.js 中的 MockSQLEngine
 *   - 不在 UI 上暴露
 *   - 仅通过 window.testSQLiteAdapter() 在 Console 中测试
 */

(function () {
  "use strict";

  // ============================================================
  // 工具函数
  // ============================================================

  /**
   * 将 JavaScript 值转义为 SQL 字面量
   */
  function escapeSQL(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") {
      if (Number.isFinite(value)) return String(value);
      return "NULL";
    }
    // 字符串：单引号转义 (SQL 标准)
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  /**
   * 从 DB_DATA 获取某张表的所有列名
   */
  function getTableColumns(tableName) {
    var schema = (typeof DB_SCHEMA !== "undefined" && DB_SCHEMA[tableName])
      ? DB_SCHEMA[tableName]
      : null;
    if (schema && schema.columns) {
      return schema.columns.map(function (c) { return c.name; });
    }
    // fallback: 从第一条数据推断
    var data = (typeof DB_DATA !== "undefined" && DB_DATA[tableName])
      ? DB_DATA[tableName]
      : null;
    if (data && data.length > 0) {
      return Object.keys(data[0]);
    }
    return [];
  }

  /**
   * 从 DB_SCHEMA 推导 SQLite CREATE TABLE 语句
   */
  function buildCreateTableSQL(tableName) {
    var schema = (typeof DB_SCHEMA !== "undefined" && DB_SCHEMA[tableName])
      ? DB_SCHEMA[tableName]
      : null;
    if (!schema || !schema.columns) {
      // 无 schema 时用数据推断，全部用 TEXT
      var cols = getTableColumns(tableName);
      if (cols.length === 0) return null;
      return "CREATE TABLE IF NOT EXISTS " + tableName + " (" +
        cols.map(function (c) { return c + " TEXT"; }).join(", ") +
        ")";
    }

    var colDefs = schema.columns.map(function (col) {
      var type = col.type || "TEXT";
      var def = col.name + " " + mapTypeToSQLite(type);
      if (col.primary) {
        def += " PRIMARY KEY";
        // AUTOINCREMENT 仅对 INTEGER PRIMARY KEY 生效
        if (type.toUpperCase().indexOf("INT") !== -1) {
          // SQLite: INTEGER PRIMARY KEY 自动递增
          // 显式 AUTOINCREMENT 避免 ROWID 复用
        }
      }
      return def;
    });

    return "CREATE TABLE IF NOT EXISTS " + tableName + " (" + colDefs.join(", ") + ")";
  }

  /**
   * 将 DB_SCHEMA 中的类型名粗略映射为 SQLite 亲和类型
   */
  function mapTypeToSQLite(type) {
    var upper = String(type).toUpperCase();
    if (/INT|SERIAL/.test(upper)) return "INTEGER";
    if (/CHAR|VARCHAR|TEXT|CLOB/.test(upper)) return "TEXT";
    if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(upper)) return "REAL";
    if (/DATE|TIME/.test(upper)) return "TEXT"; // SQLite 无原生日期类型
    if (/BLOB/.test(upper)) return "BLOB";
    return "TEXT";
  }

  // ============================================================
  // 方言翻译：MySQL → SQLite
  // ============================================================
  // 每条规则按顺序应用，已处理的语法不会再被后续规则误伤
  // 未支持的语法会抛出明确错误

  var DIALECT_RULES = [
    // 1. NOW() → datetime('now')
    {
      name: "NOW()",
      pattern: /\bNOW\(\s*\)/gi,
      replacement: "datetime('now')",
    },
    // 2. CHAR_LENGTH(x) → LENGTH(x)
    {
      name: "CHAR_LENGTH",
      pattern: /\bCHAR_LENGTH\(\s*/gi,
      replacement: "LENGTH(",
    },
    // 3. START TRANSACTION → BEGIN TRANSACTION
    {
      name: "START TRANSACTION",
      pattern: /\bSTART\s+TRANSACTION\b/gi,
      replacement: "BEGIN TRANSACTION",
    },
    // 4. DROP INDEX idx ON table → DROP INDEX idx
    {
      name: "DROP INDEX ... ON",
      pattern: /\bDROP\s+INDEX\s+(\w+)\s+ON\s+\w+\s*/gi,
      replacement: "DROP INDEX $1 ",
    },
    // 5. INT AUTO_INCREMENT PRIMARY KEY → INTEGER PRIMARY KEY AUTOINCREMENT
    {
      name: "AUTO_INCREMENT (table def)",
      pattern: /\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi,
      replacement: "INTEGER PRIMARY KEY AUTOINCREMENT",
    },
    // 6. standalone AUTO_INCREMENT → AUTOINCREMENT
    {
      name: "AUTO_INCREMENT (standalone)",
      pattern: /\bAUTO_INCREMENT\b/gi,
      replacement: "AUTOINCREMENT",
    },
    // 7. CONCAT(a, b, ...) → a || b || ...   (2+ 参数)
    {
      name: "CONCAT(...)",
      pattern: /\bCONCAT\(\s*/gi,
      replacement: "(",
      // 特殊处理：标记替换起点，后续在 translateSQL 中用额外逻辑把 , 换成 ||
      // 这里采用简化正则：只替换 CONCAT( 开头，后续在专用函数中处理
    },
    // 8. IFNULL(x, y) → COALESCE(x, y)  (常见兼容需求)
    {
      name: "IFNULL",
      pattern: /\bIFNULL\(\s*/gi,
      replacement: "COALESCE(",
    },
    // 9. CURDATE() / CURRENT_DATE() → date('now')
    {
      name: "CURDATE",
      pattern: /\bCURDATE\(\s*\)/gi,
      replacement: "date('now')",
    },
    // 10. SYSDATE() → datetime('now')
    {
      name: "SYSDATE",
      pattern: /\bSYSDATE\(\s*\)/gi,
      replacement: "datetime('now')",
    },
  ];

  /**
   * 专门处理 CONCAT(a, b, ...) 转换
   * 因为需要追踪括号层级，无法用简单正则一步完成
   */
  function translateConcat(sql) {
    // 匹配 CONCAT( ... ) 找出顶层 CONCAT 调用
    var result = sql;
    var changed = true;
    var maxIter = 10;
    while (changed && maxIter-- > 0) {
      changed = false;
      result = result.replace(/\bCONCAT\(/gi, function () {
        changed = true;
        return "(";
      });
    }

    // 上面的方法太粗暴——没法区分 CONCAT(a,b) 里的逗号和普通逗号
    // 改为更精确的方式：逐字符扫描括号层级
    var out = "";
    var i = 0;
    var s = sql;
    while (i < s.length) {
      // 检测 CONCAT(
      var rest = s.slice(i);
      var m = rest.match(/^CONCAT\s*\(\s*/i);
      if (m) {
        i += m[0].length;
        out += "(";
        // 扫描括号内的参数，把顶层逗号替换为 ||
        var depth = 1;
        var argStart = out.length; // 记录参数开始位置（在 out 中的索引暂不需要，我们用 token 收集）
        var tokens = [];
        var current = "";
        while (i < s.length && depth > 0) {
          var ch = s[i];
          if (ch === "(") {
            depth++;
            current += ch;
          } else if (ch === ")") {
            depth--;
            if (depth === 0) {
              if (current.trim()) tokens.push(current.trim());
              // CONCAT 结束
              break;
            } else {
              current += ch;
            }
          } else if (ch === "," && depth === 1) {
            // 顶层逗号 → ||
            if (current.trim()) tokens.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
          i++;
        }
        // 用 || 连接所有参数
        out += tokens.join(" || ");
        out += ")";
        i++; // 跳过右括号
      } else {
        out += s[i];
        i++;
      }
    }
    return out;
  }

  // ============================================================
  // SQLiteAdapter 类
  // ============================================================

  var SQLiteAdapter = function () {
    /**
     * sql.js Database 实例
     * @type {object|null}
     */
    this.db = null;

    /**
     * 是否已完成初始化（表结构 + 数据已写入）
     * @type {boolean}
     */
    this.ready = false;

    /**
     * 最近一次异步错误的描述
     * @type {string|null}
     */
    this.lastError = null;
  };

  SQLiteAdapter.prototype = {

    // --------------------------------------------------------
    // 初始化
    // --------------------------------------------------------

    /**
     * 异步初始化 SQLite 内存数据库
     * - 加载 sql.js WASM
     * - 从 DB_SCHEMA 建表
     * - 从 DB_DATA 插入初始数据
     * - 创建兼容字段
     *
     * @returns {Promise<boolean>} 初始化是否成功
     */
    init: async function () {
      this.ready = false;
      this.lastError = null;

      // 检查 sql.js 是否已加载
      if (typeof initSqlJs === "undefined") {
        this.lastError =
          "sql.js 尚未加载。请将 sql-wasm.js 和 sql-wasm.wasm 放置于 assets/vendor/ 目录，" +
          "并在 index.html 中引入：<script src=\"assets/vendor/sql-wasm.js\"></script>";
        console.warn("[SQLiteAdapter] " + this.lastError);
        return false;
      }

      try {
        var self = this;
        var SQL = await initSqlJs({
          locateFile: function (file) {
            return "assets/vendor/" + file;
          },
        });
        this.db = new SQL.Database();
        this._createAllTables();
        this._insertAllData();
        this._applyCompatibilityFields();
        this.ready = true;
        console.log("[SQLiteAdapter] 初始化完成 — 内存 SQLite 数据库已就绪。");
        return true;
      } catch (e) {
        this.lastError = e.message || String(e);
        console.error("[SQLiteAdapter] 初始化失败:", e);
        this.ready = false;
        return false;
      }
    },

    // --------------------------------------------------------
    // 查询状态
    // --------------------------------------------------------

    /**
     * 返回适配器是否已就绪
     * @returns {boolean}
     */
    isReady: function () {
      return this.ready && this.db !== null;
    },

    /**
     * 返回最近一次错误信息
     * @returns {string|null}
     */
    getLastError: function () {
      return this.lastError;
    },

    // --------------------------------------------------------
    // SQL 方言转换
    // --------------------------------------------------------

    /**
     * 将 MySQL 方言 SQL 转为 SQLite 兼容 SQL
     *
     * 支持的转换：
     *   NOW()              → datetime('now')
     *   CHAR_LENGTH(x)     → LENGTH(x)
     *   START TRANSACTION  → BEGIN TRANSACTION
     *   AUTO_INCREMENT     → AUTOINCREMENT
     *   CONCAT(a,b)        → (a || b)
     *   IFNULL(a,b)        → COALESCE(a,b)
     *   DROP INDEX x ON y  → DROP INDEX x
     *   CURDATE()          → date('now')
     *   SYSDATE()          → datetime('now')
     *
     * 明确拒绝：
     *   RIGHT JOIN         → 抛出友好错误
     *
     * @param {string} sql - 原始 SQL
     * @returns {string} - 转换后的 SQL
     */
    translateSQL: function (sql) {
      var translated = String(sql || "");

      // 0. 检测 RIGHT JOIN — 提前拒绝
      if (/\bRIGHT\s+(OUTER\s+)?JOIN\b/i.test(translated)) {
        throw new Error(
          "RIGHT JOIN はSQLiteでサポートされていません。" +
            "LEFT JOIN に書き換えてください。" +
            " (RIGHT JOIN is not supported in SQLite. Please rewrite using LEFT JOIN.)"
        );
      }

      // 1. 先用专门函数处理 CONCAT（需要括号层级追踪）
      translated = translateConcat(translated);

      // 2. 应用其他正则规则
      for (var i = 0; i < DIALECT_RULES.length; i++) {
        var rule = DIALECT_RULES[i];
        if (rule.name === "CONCAT(...)") continue; // 已在上面处理
        translated = translated.replace(rule.pattern, rule.replacement);
      }

      return translated;
    },

    // --------------------------------------------------------
    // 执行 SQL
    // --------------------------------------------------------

    /**
     * 执行 SQL 语句，返回与 MockSQLEngine 兼容的结果格式。
     *
     * 成功返回：
     *   { success: true, columns: [...], rows: [[...]] }
     *   { success: true, columns: [...], rows: [[...]], message: "..." }
     *
     * 失败返回：
     *   { success: false, error: "..." }
     *
     * @param {string} sql - 用户输入的 SQL
     * @returns {{success:boolean, columns?:string[], rows?:any[][], message?:string, error?:string}}
     */
    execute: function (sql) {
      if (!this.isReady()) {
        return {
          success: false,
          error:
            "SQLiteAdapter 尚未初始化。" +
            (this.lastError ? " " + this.lastError : "") +
            " 请在 Console 运行: await adapter.init()",
        };
      }

      try {
        var translated = this.translateSQL(sql);
        var upperSql = translated.trim().toUpperCase();

        // --- DDL (CREATE / DROP / ALTER) ---
        if (/^(CREATE|DROP|ALTER)\s/i.test(translated)) {
          this.db.run(translated);
          return {
            success: true,
            message:
              "DDL文の文法は正しいです！(学習シミュレータのため、スキーマ構造の永続変更は行われません)",
            columns: ["Status"],
            rows: [["Success / 構文確認OK"]],
          };
        }

        // --- SELECT / WITH (查询) ---
        if (upperSql.startsWith("SELECT") || upperSql.startsWith("WITH")) {
          var results = this.db.exec(translated);
          if (!results || results.length === 0) {
            // 某些 SELECT 不返回行（如纯函数调用），也算成功
            return { success: true, columns: [], rows: [] };
          }
          var firstResult = results[0];
          return {
            success: true,
            columns: firstResult.columns.slice(),
            rows: firstResult.values.map(function (row) {
              return row.slice();
            }),
          };
        }

        // --- DML (INSERT / UPDATE / DELETE / BEGIN / COMMIT / ROLLBACK) ---
        if (
          /^(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|PRAGMA|REPLACE)\s/i.test(
            translated
          )
        ) {
          // 对多语句（如 BEGIN; ...; COMMIT;）逐条执行
          var stmts = translated.split(";").filter(function (s) {
            return s.trim().length > 0;
          });
          var totalChanges = 0;
          for (var si = 0; si < stmts.length; si++) {
            this.db.run(stmts[si].trim() + ";");
            totalChanges += this.db.getRowsModified();
          }

          return {
            success: true,
            message: totalChanges + " 行が処理されました。",
            columns: ["Changes"],
            rows: [[totalChanges]],
          };
        }

        // --- 兜底尝试 ---
        this.db.run(translated);
        var fallbackChanges = this.db.getRowsModified();
        return {
          success: true,
          message: "実行しました。(" + fallbackChanges + " 行)",
          columns: ["Result"],
          rows: [["OK"]],
        };
      } catch (e) {
        // 提取 SQLite 错误信息
        var errMsg = e.message || String(e);
        // sql.js 通常会抛出 "Execution error: ..." 或直接的 SQLite 错误
        return {
          success: false,
          error: errMsg.replace(/^Execution error:\s*/i, ""),
        };
      }
    },

    // --------------------------------------------------------
    // 重置数据库到初始状态
    // --------------------------------------------------------

    /**
     * 重置数据库：删除所有表后重新建表、重新导入初始数据。
     * 与 MockSQLEngine.reset() 效果一致。
     */
    reset: function () {
      if (!this.db) return;

      var tables = [
        "orders",
        "members",
        "cats",
        "books",
        "departments_mst",
        "students_mst",
      ];
      for (var i = 0; i < tables.length; i++) {
        try {
          this.db.run("DROP TABLE IF EXISTS " + tables[i]);
        } catch (e) {
          // 忽略
        }
      }

      this._createAllTables();
      this._insertAllData();
      this._applyCompatibilityFields();
    },

    // --------------------------------------------------------
    // 内部方法：建表
    // --------------------------------------------------------

    /**
     * 根据 DB_SCHEMA 创建所有表
     */
    _createAllTables: function () {
      var tableNames = [
        "students_mst",
        "departments_mst",
        "books",
        "cats",
        "members",
        "orders",
      ];
      var self = this;
      tableNames.forEach(function (name) {
        var ddl = buildCreateTableSQL(name);
        if (ddl) {
          self.db.run(ddl);
        }
      });
    },

    // --------------------------------------------------------
    // 内部方法：插入初始数据
    // --------------------------------------------------------

    /**
     * 从 DB_DATA 中读取所有行并逐行 INSERT
     */
    _insertAllData: function () {
      if (typeof DB_DATA === "undefined") {
        console.warn("[SQLiteAdapter] DB_DATA 未定义，跳过数据填充。");
        return;
      }

      var tableNames = [
        "students_mst",
        "departments_mst",
        "books",
        "cats",
        "members",
        "orders",
      ];
      var self = this;

      tableNames.forEach(function (tableName) {
        var rows = DB_DATA[tableName];
        if (!rows || rows.length === 0) return;

        // 取第一条数据获取列名和列序
        var columns = Object.keys(rows[0]);

        // 逐行生成 INSERT
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var vals = columns.map(function (col) {
            return escapeSQL(row[col]);
          });
          var insertSQL =
            "INSERT INTO " +
            tableName +
            " (" +
            columns.join(", ") +
            ") VALUES (" +
            vals.join(", ") +
            ")";
          try {
            self.db.run(insertSQL);
          } catch (e) {
            console.warn(
              "[SQLiteAdapter] 插入 " + tableName + " 第" + (r + 1) + "行失败:",
              e.message
            );
          }
        }
      });
    },

    // --------------------------------------------------------
    // 内部方法：兼容字段
    // --------------------------------------------------------

    /**
     * 创建兼容字段以支持题库中的列名引用
     *
     * members 表:
     *   + email  TEXT DEFAULT NULL     （模拟不存在的邮箱字段）
     *   + address TEXT                 （映射自 city）
     *   UPDATE members SET address = city
     *
     * orders 表:
     *   + ord_id INTEGER               （映射自 order_id）
     *   UPDATE orders SET ord_id = order_id
     */
    _applyCompatibilityFields: function () {
      // members: 添加 email 列
      try {
        this.db.run("ALTER TABLE members ADD COLUMN email TEXT");
        // 所有行 email 保持 NULL（符合现实：不是所有人都有邮箱）
        console.log("[SQLiteAdapter] members.email 兼容字段已添加 (默认 NULL)。");
      } catch (e) {
        // 列已存在
      }

      // members: 添加 address 列，映射到 city
      try {
        this.db.run("ALTER TABLE members ADD COLUMN address TEXT");
        this.db.run("UPDATE members SET address = city");
        console.log("[SQLiteAdapter] members.address 兼容字段已添加 (映射自 city)。");
      } catch (e) {
        // 列已存在
      }

      // orders: 添加 ord_id 列，映射到 order_id
      try {
        this.db.run("ALTER TABLE orders ADD COLUMN ord_id INTEGER");
        this.db.run("UPDATE orders SET ord_id = order_id");
        console.log("[SQLiteAdapter] orders.ord_id 兼容字段已添加 (映射自 order_id)。");
      } catch (e) {
        // 列已存在
      }
    },
  };

  // ============================================================
  // 暴露到全局
  // ============================================================

  window.SQLiteAdapter = SQLiteAdapter;

  // ============================================================
  // Console 测试入口
  // ============================================================
  // 在浏览器 Console 中运行：
  //   await window.testSQLiteAdapter()
  //
  // 测试覆盖：
  //   1. SELECT * FROM students_mst LIMIT 3;
  //   2. SELECT name, email FROM members;
  //   3. SELECT mem_id, address FROM members;
  //   4. SELECT ord_id, total FROM orders;
  //   5. SELECT COUNT(*) FROM students_mst;

  window.testSQLiteAdapter = async function () {
    console.log("═══════════════════════════════════════════");
    console.log("  SQLiteAdapter 功能测试");
    console.log("═══════════════════════════════════════════");

    // 检查 sql.js 是否已加载
    if (typeof initSqlJs === "undefined") {
      console.warn("⚠️  sql.js 尚未加载。");
      console.info("   请将以下文件放入 assets/vendor/ 目录：");
      console.info("   • assets/vendor/sql-wasm.js");
      console.info("   • assets/vendor/sql-wasm.wasm");
      console.info("");
      console.info("   下载地址：https://sql.js.org/");
      console.info("   npm: npm install sql.js");
      console.info("   CDN: https://cdnjs.com/libraries/sql.js");
      console.info("");
      console.info("   然后在 index.html 的 data/db.js 之后添加：");
      console.info('   <script src="assets/vendor/sql-wasm.js"></script>');
      console.info("═══════════════════════════════════════════");
      return { status: "SKIPPED", reason: "sql.js not loaded" };
    }

    var adapter = new SQLiteAdapter();
    console.log("1. 创建 SQLiteAdapter 实例...");
    console.log("2. 初始化 sql.js WASM + 建表 + 导入数据...");

    var ok = await adapter.init();
    if (!ok) {
      console.error("❌ 初始化失败:", adapter.getLastError());
      return { status: "FAILED", phase: "init", error: adapter.getLastError() };
    }
    console.log("✅ 初始化成功");

    var tests = [
      {
        label: "SELECT * FROM students_mst LIMIT 3",
        sql: "SELECT * FROM students_mst LIMIT 3;",
        expectCols: 11, // students_mst 有 11 列
        expectRows: 3,
      },
      {
        label: "SELECT name, email FROM members",
        sql: "SELECT name, email FROM members;",
        expectCols: 2,
        expectRows: 8, // members 有 8 行
      },
      {
        label: "SELECT mem_id, address FROM members",
        sql: "SELECT mem_id, address FROM members;",
        expectCols: 2,
        expectRows: 8,
      },
      {
        label: "SELECT ord_id, total FROM orders",
        sql: "SELECT ord_id, total FROM orders;",
        expectCols: 2,
        expectRows: 15, // orders 有 15 行
      },
      {
        label: "SELECT COUNT(*) FROM students_mst",
        sql: "SELECT COUNT(*) FROM students_mst;",
        expectCols: 1,
        expectRows: 1,
      },
      {
        label: "[方言] SELECT NOW()",
        sql: "SELECT NOW();",
        expectCols: 1,
        expectRows: 1,
      },
    ];

    var passed = 0;
    var failed = 0;
    var results = [];

    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      var res = adapter.execute(t.sql);
      var ok_test =
        res.success &&
        res.columns &&
        res.columns.length === t.expectCols &&
        res.rows &&
        res.rows.length === t.expectRows;

      results.push({
        test: t.label,
        success: res.success,
        columns: res.columns ? res.columns.length : 0,
        rows: res.rows ? res.rows.length : 0,
        expectedCols: t.expectCols,
        expectedRows: t.expectRows,
        pass: ok_test,
        error: res.error || null,
      });

      if (ok_test) {
        passed++;
        console.log("  ✅ " + t.label + " — " + res.rows.length + " 行");
      } else {
        failed++;
        console.error("  ❌ " + t.label);
        if (res.error) console.error("     错误: " + res.error);
        else
          console.error(
            "     列: " +
              (res.columns ? res.columns.length : 0) +
              "/" +
              t.expectCols +
              "  行: " +
              (res.rows ? res.rows.length : 0) +
              "/" +
              t.expectRows
          );
      }
    }

    console.log("───────────────────────────────────────────");
    console.log("  结果: " + passed + " / " + tests.length + " 通过");
    if (failed > 0) console.warn("  ⚠️  " + failed + " 项测试未通过");
    console.log("═══════════════════════════════════════════");

    return {
      status: failed === 0 ? "PASSED" : "PARTIAL",
      passed: passed,
      failed: failed,
      total: tests.length,
      results: results,
    };
  };
})();
