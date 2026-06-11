# Study Tools Web/PWA 项目交接文档 (PROJECT_HANDOFF.md)

本文件作为多 AI 协同和人机协作的唯一上下文交接凭证。后续所有阶段的演进与状态更新应统一在此文件中维护。

---

## 1. 项目基本信息

* **GitHub 仓库**：https://github.com/bwins0668/study-tools-web
* **Cloudflare Pages 项目名**：`study-tools-web-pages`
* **线上部署地址**：https://study-tools-web-pages.pages.dev
* **本地工作区路径**：`E:\项目\sql-learning-hub-web-public`
* **当前分支**：`master`
* **当前主要 Tags**：
  * `mobile-v1` (移动端优化版本)
  * `web-safe-v1` (安全性/Web限制版本)
  * `pwa-ready-v1` (PWA 离线优化版本)
  * `sql-json-v1` (SQL 动态加载试点版本)
* **最新线上 Commit**：`d02e268`
* **当前已完成阶段**：**阶段 9H/9I：IT Passport 历年真题库 JSON 单文件懒加载**
  * **命名说明**：阶段编号在开发过程中曾有 9H / 9I 的差异，但实际对应同一个任务，统一记录为 **阶段 9H/9I**。
  * **状态**：已完成 / 已提交 / 已推送 / Cloudflare Pages 已部署成功 / 线上验证通过
  * **提交 commit**：`d02e268 perf: lazy-load IT Passport past exams from JSON`
  * **线上验证结果（Cloudflare Pages Production + iPhone 实机）**：
    * 首屏不加载 `it_passport_past_exams.js` / `.json`
    * 点击 IT Passport CBT 开始考试后才加载 `data/it_passport_past_exams.json`
* **最新线上 Commit**：`d02e268`（9H/9I），本地最新修改：**阶段 9K（未提交）**
* **上一个已完成阶段**：**阶段 9H/9I：IT Passport 历年真题库 JSON 单文件懒加载**（已上线）
* **当前进行阶段**：**阶段 9K：Python 课程数据 JSON 单文件懒加载**
  * **状态**：本地测试通过，等待 commit 确认
  * **阶段 9K 修改文件（未提交）**：
    * `index.html` — 注释掉 `data/python_lessons.js` 首屏 script 引用
    * `assets/js/app.js` — 新增 `ensurePythonLessonsLoaded()`（fetch JSON + 内存缓存 + 兼容回滚），`switchPythonSubMode` 改为 async 并在 lessons 模式 await 懒加载，所有 `PYTHON_LESSONS` 引用统一使用 `window.PYTHON_LESSONS`
    * `service-worker.js` — 缓存版本 `v5 → v6`，CORE_ASSETS 加入 `./data/python_lessons.json`
    * `data/python_lessons.json` — 新增（~1.56MB，255 条课程），从 `.js` 转换的独立 JSON 文件
  * **回滚方案**：
    * 方式一（代码回退）：`git checkout -- index.html assets/js/app.js service-worker.js`；`data/python_lessons.js` 保留在仓库中可随时恢复首屏 script 引用
    * 方式二（Cloudflare Rollback）：在 Cloudflare Pages 控制台直接 Rollback 到 `d02e268`（上一稳定版本）

---

## 2. 版本分工与分流策略

### 桌面完整版 (E:\项目\sql-learning-hub)
* **定位**：本地桌面完整版 / 离线学习平台，支持本地完整沙盒运行。
* **物理依赖**：本地 `python.exe`、本地 JDK、本地 `server.py`、`study_ai.py` 脚本及 sqlite3 数据库 `data/study_ai.db`。可通过 PyInstaller 等打包为 `Study-Tools.exe`。

### Web公开版 (E:\项目\sql-learning-hub-web-public)
* **定位**：公开在线版 / PWA。支持部署在 Cloudflare Pages 并在手机/电脑浏览器直接访问。
* **物理排除**：严格不能包含本地 Python/JDK 环境、`server.py`/`study_ai.py` 脚本、Token 密钥以及本地明文 SQLite 数据库文件（已全部写入 `.gitignore`）。
* **同步策略**：当桌面版课程或题库新增内容时，在根目录下通过以下脚本选择性同步非隐私资源：
  ```powershell
  $Desktop = "E:\项目\sql-learning-hub"
  $Web = "E:\项目\sql-learning-hub-web-public"
  robocopy "$Desktop\data" "$Web\data" /E
  robocopy "$Desktop\textbooks" "$Web\textbooks" /E
  robocopy "$Desktop\tools" "$Web\tools" /E
  ```

---

## 3. 核心架构与关键适配机制

### 3.1 技术栈约束
* 原生 HTML5 + 纯 Vanilla CSS (全局 CSS 变量系统) + 原生 JavaScript。
* 不引入 React/Vite/Next.js/Webpack 等现代构建工具，禁止大面积重构代码。
* 本地静态预览可使用 `npm run dev` (`live-server`)；若调试 Cloudflare Functions 接口代理，必须使用 `npm run dev:functions` (`npx wrangler pages dev .`，运行在端口 `8788`)。

### 3.2 Java / Python “Web安全模式”运行机制
* **适配原理**：Web 版出于无服务器零成本运行及沙盒安全性的考虑，移除了本地进程执行逻辑。对于不支持在浏览器执行的 Java/Python 脚本，会在代码运行区显示 **“Web安全模式 / Webセーフモード”**。
* **引导体验**：用户点击运行时，沙盒会在输出区打印双语友好引导说明，指引有完整本地运行需求的用户前往 GitHub Releases 的最新 Windows 离线安装包进行下载（超链接使用安全属性 `target="_blank" rel="noopener noreferrer"`）。
* **代理接口**：远程执行请求通过 `functions/api/execute.js` 进行 API 代发。当未配置 `PISTON_BASE_URL` 时，接口会优雅降级并返回 HTTP 503 提示，保证前端绝不崩溃。

### 3.3 SQL.js 本地数据库适配机制
* **运行机制**：Web 版放弃了本地 python-sqlite 桥接，直接使用浏览器端 SQLite WASM (`assets/vendor/sql-wasm.js` 和 `sql-wasm.wasm`)。
* **数据持久化**：用户练习所做的数据更改仅存在于浏览器运行内存中。如需重新答题或数据库损坏，支持一键“重置数据库”重新加载预置 Schema 脚本。

### 3.4 动态数据 JSON 按需懒加载机制 (阶段 9D/9F/9H-9I 成果)
* **首屏减负**：原 `index.html` 同步 script 载入的数据量高达 13MB+。已将以下数据文件从首屏中剔除，改在用户实际进入对应科目考试并点击“开始考试”按钮时，进行异步 Fetch 懒加载：
  * SQL 题库：`data/sql_exam_questions.json` (体积约 260KB)
  * SG 历年真题：`data/sg_past_exams.json` (体积约 1.05MB)
  * IT Passport 历年真题：`data/it_passport_past_exams.json` (体积约 4.8MB)
* **双重缓存**：内存中使用 `window.__SQL_EXAM_QUESTIONS_CACHE` / `window.__SG_PAST_EXAMS_CACHE` / `window.__IT_PASSPORT_PAST_EXAMS_CACHE` 进行首轮缓存。PWA 层面通过在 `service-worker.js` 的 `CORE_ASSETS` 中注册 JSON 资源进行预缓存，确保**完全离线状态下所有题库 100% 可用**。
* **当前 Service Worker 版本**：`study-tools-web-v5`

---

## 4. 重要文件及目录说明

### 核心代码
* `index.html`：项目单一入口文件。
* `assets/js/app.js`：全局核心业务逻辑，控制模拟测试生命周期、题目渲染、时间倒数及路由切换。
* `service-worker.js`：定义 PWA 的预缓存清单和 Stale-while-revalidate 静态资产拦截策略。

### 🚨 不能乱动的文件
* `functions/api/execute.js`：处理后端代理转发，包含敏感环境变量。
* `assets/js/sqlite-adapter.js`：SQLite WASM 基础适配器与 SQL 方言兼容视图适配层。
* `assets/js/java_sandbox.js` & `assets/js/python_sandbox.js`：定义了 Java/Python Web安全模式的沙盒处理，属于已定案的限制机制。
* `assets/css/index.css`：定义了整套美学 CSS 变量和全局基础样式。

---

## 5. 测试与验证清单

### 5.1 自动化 E2E 测试
* **运行命令**：
  ```powershell
  # 1. 在 Wrangler Pages Dev 模式下启动本地服务
  npx wrangler pages dev . --port 8788
  # 2. 运行 Playwright 自动化回归测试脚本 (Python)
  python -u scratch/test_zero_cost_mode.py
  ```
* **测试用例覆盖范围**：
  1. 首屏非阻塞验证：确认 `sql_exam_questions.js`/`json` 及 `sg_past_exams.js`/`json` 首屏未被加载。
  2. SQL 基础执行：在 Playground 运行查询，验证输出表格格式和 WASM 加载。
  3. SQL CBT 模拟测试：点击开始后，动态抓取 JSON，缓存，并渲染第一题。
  4. SG CBT 真题模拟测试：点击开始后，动态抓取 JSON，支持年份检索、题数控制及随机选项打乱，界面渲染无阻。
  5. Java/Python 友好降级提示：验证输出中包含 “安全限制 / 制限” 和跳转到 GitHub Releases 的安全链接。
  6. 运行时控制台无未捕获异常。

---

## 6. 当前风险与后续路线图

### 6.1 待办风险
* ~~**IT Passport 懒加载**：已完成（阶段 9H/9I），线上验证通过，commit: d02e268。~~
* **Python 课程 JSON 动态加载**：`data/python_lessons.js` 目前仍在首屏加载中，可作为下一阶段处理目标。

### 6.2 后续演进步骤
```text
[已完成] 阶段9D：SQL 模拟考试 JSON 动态加载试点
[已完成] 阶段9F：SG 历年真题库 JSON 动态加载重构 (commit: bf42213)
[已完成] 阶段9G：CBT 模拟考试手机端布局优化 (commit: 759a0ca)
[已完成] 阶段9H/9I：IT Passport 历年真题库 JSON 单文件懒加载 (commit: d02e268)
    ↓
[待启动] 下一阶段：Python 课程/Lessons JSON 动态加载重构（data/python_lessons.js 体积约 1.2MB）
```

---

## 7. 给下一位 AI 的接手指令

1. **核实当前状态**：
   * 最新 commit：`d02e268`，分支 `master`，已推送至 GitHub
   * Cloudflare Pages 已部署 `d02e268`，线上验证通过
   * `git status` 应为 clean（`tools/` 下4个临时诊断脚本已加入 `.gitignore`）
2. **核实本地开发环境**：
   * 启动 Wrangler Pages 调试代理：`npx wrangler pages dev . --port 8788`
   * 运行自动化脚本 `python -u scratch/test_zero_cost_mode.py` 确认所有测试正常输出 `=== ALL SYSTEM TESTS PASSED SUCCESSFUL ===`
3. **已完成阶段 9H/9I** — IT Passport 懒加载已上线，无需任何操作。
4. **启动下一阶段：Python 课程/Lessons JSON 动态加载重构**：
   * 参照 `convert_sg_questions.py` 的解析逻辑，将 `data/python_lessons.js` 转换为 `data/python_lessons.json`
   * 在 `index.html` 移除 Python 课程的同步加载标签（保留其他科目的 lessons 标签）
   * 在 `assets/js/app.js` 新增对应异步加载函数，并使用独立缓存变量 `window.__PYTHON_LESSONS_CACHE`
   * 在 `service-worker.js` 升级缓存版本（`v5 → v6`）并将其加入 `CORE_ASSETS` 以确保离线可用
   * 修改测试脚本增加对 Python 课程按需加载的覆盖
5. **严格限制**：
   * 不要删除 `data/it_passport_past_exams.js`（保留作为历史备份）
   * 不要动 `functions/api/execute.js`、`assets/js/sqlite-adapter.js`、Java/Python Sandbox 相关文件
   * 不要使用 `git add .`，每次只精确 add 计划提交的文件
   * 不要 force push
