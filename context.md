# Study Tools Web/PWA 改造上下文

> 这个文件用于在 ChatGPT / Codex / Claude Code / Gemini / 其他 AI 编程平台之间切换时，快速恢复项目上下文。  
> 当前目标：把桌面完整版 `Study Tools` 拆出一个安全、可公开部署的 Web/PWA 公开版。

---

## 1. 项目基本信息

### 桌面完整版

路径：

```text
E:\项目\sql-learning-hub
```

定位：

```text
本地桌面完整版 / 离线学习平台
```

特点：

- 可依赖本地 `python.exe`
- 可依赖本地 JDK
- 可使用 `server.py`
- 可使用 `study_ai.py`
- 可使用本地数据库 `study_ai.db`
- 可打包为 `Study-Tools.exe`
- 适合离线、个人使用、完整版功能

### Web公开版

路径：

```text
E:\项目\sql-learning-hub-web-public
```

定位：

```text
公开网站 / PWA / 手机电脑都能访问的 Web 版
```

目标：

- 可部署到 Cloudflare Pages / Vercel / Netlify / GitHub Pages 等平台
- 可作为 PWA 安装到桌面和手机
- 不依赖本地 `python.exe`
- 不依赖本地 JDK
- 不依赖本地 `server.py`
- 不公开本地学习数据库、缓存、Token、日志
- Java/Python 通过远程执行服务完成
- SQL 后续改为 `sql.js / SQLite WASM` 浏览器本地执行

---

## 2. 当前技术栈

当前项目不是 React/Vite/Next 项目。

实际技术栈：

```text
原生 HTML
原生 CSS
原生 JavaScript
全局变量 / 全局函数 / 内联 onclick
live-server 静态预览
Cloudflare Pages Functions
```

`package.json` 原始启动方式：

```json
{
  "scripts": {
    "dev": "npx -y live-server"
  }
}
```

Web 版已新增：

```json
{
  "dev:functions": "npx wrangler pages dev ."
}
```

注意：

- `npm run dev` / `live-server` 只能跑静态页面
- `npm run dev:functions` / `npx wrangler pages dev .` 才能测试 Cloudflare Functions
- 当前不要引入 React、Vite、Next、Webpack
- 当前不要重写项目

---

## 3. Web公开版现有关键文件

Web 公开版路径：

```text
E:\项目\sql-learning-hub-web-public
```

标志文件：

```text
manifest.webmanifest
service-worker.js
WEB_PUBLIC_README.md
functions/api/execute.js
assets/js/code-runner-api.js
```

主要入口：

```text
index.html
```

主要样式：

```text
assets/css/index.css
assets/css/light-theme.css
assets/css/japanese-typing.css
assets/css/ai_learning.css
```

主要逻辑：

```text
assets/js/app.js
assets/js/java_sandbox.js
assets/js/python_sandbox.js
assets/js/code-runner-api.js
assets/js/ai_assistant.js
assets/js/i18n.js
assets/js/japanese_typing.js
```

主要数据：

```text
data/lessons.js
data/db.js
data/java_lessons.js
data/python_lessons.js
data/sql_exam_questions.js
data/java_exam_questions.js
data/python_exam_questions.js
data/it_passport_*
data/sg_*
```

---

## 4. 当前已经完成的阶段

### 阶段 0：Web公开版安全清理

已完成。

目标：

```text
确保 Web 公开版不包含隐私数据、本地运行环境、缓存、临时文件和 Token。
```

已删除：

```text
data/study_ai.db
tools/__pycache__/
8 个 .pyc 文件
```

已确认或排除：

```text
server.py
study_ai.py
python/
jdk/
Study-Tools.exe
.chrome-release-check-profile/
.study-tools-browser-profile/
.playwright-cli/
test-results/
output/
backups/
__pycache__/
*.pyc
*.db-journal
*.log
```

`.gitignore` 已新增/更新，排除：

```text
data/study_ai.db
server.py
study_ai.py
python/
jdk/
Study-Tools.exe
.chrome-release-check-profile/
.study-tools-browser-profile/
.playwright-cli/
test-results/
output/
backups/
__pycache__/
*.pyc
*.db-journal
*.log
.wrangler/
node_modules/
.dev.vars*
.env*
```

`functions/api/execute.js` 已调整：

- 从 `context.env.PISTON_BASE_URL` 读取远程执行服务地址
- 从 `context.env.PISTON_TOKEN` 读取可选 Token
- Token 只在服务端通过 `Authorization: Bearer` 发送
- 没有配置 `PISTON_BASE_URL` 时返回 HTTP 503
- 错误信息为：

```text
远程代码执行服务尚未配置
```

- 不再硬编码 `emkc.org`
- 不在 Cloudflare Function 内直接执行用户代码
- 只代理远程执行服务

---

### 阶段 2：Java / Python 远程执行适配

已完成。

目标：

```text
Web 公开版不再请求 /runjava 和 /runpython。
统一调用 WebCodeRunner。
```

修改文件：

```text
assets/js/java_sandbox.js
assets/js/python_sandbox.js
assets/js/app.js
assets/js/code-runner-api.js
functions/api/execute.js
```

已替换 `/runjava`：

```text
普通练习：assets/js/java_sandbox.js
编程考试：assets/js/app.js
```

改为：

```js
await window.WebCodeRunner.runJava(code, stdin);
```

已替换 `/runpython`：

```text
普通练习：assets/js/python_sandbox.js
编程考试：assets/js/app.js
```

改为：

```js
await window.WebCodeRunner.runPython(code, stdin);
```

当前活动文件中不应再出现：

```text
/runjava
/runpython
```

`WebCodeRunner` 统一返回格式：

```js
{
  success: boolean,
  output: string,
  compileError: string,
  runtimeError: string,
  executionTimeMs: number,
  error: string
}
```

`execute.js` 转换逻辑：

- `run.stdout` 转为 `output`
- Java `compile` 非零退出转为 `compileError`
- Python `SyntaxError`、`IndentationError`、`TabError` 转为 `compileError`
- `run` 非零退出转为 `runtimeError`
- 无编译或运行错误时 `success: true`
- 网络、配置及上游格式错误写入 `error`
- 未配置执行服务时返回 HTTP 503
- `executionTimeMs` 记录远程执行请求耗时

Python 测试用例：

```python
name = input().strip()
print(f"Hello, {name}!")
```

stdin：

```text
Codex
```

预期：

```text
Hello, Codex!
```

Java 测试用例：

```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("Hello, " + scanner.nextLine() + "!");
    }
}
```

stdin：

```text
Codex
```

预期：

```text
Hello, Codex!
```

本地测试方式：

新建 `.dev.vars`，注意此文件应被 `.gitignore` 排除：

```text
PISTON_BASE_URL=https://你的执行服务地址
PISTON_TOKEN=你的可选Token
```

启动：

```powershell
npm run dev:functions
```

或：

```powershell
npx wrangler pages dev .
```

访问：

```text
http://127.0.0.1:8788
```

不配置环境变量时，页面应在原输出区显示：

```text
远程代码执行服务尚未配置
```

而不是页面崩溃。

---

## 5. Git 状态

已提交阶段 0 + 阶段 2 成果。

提交信息：

```text
feat: adapt java python execution for web public version
```

示例提交输出：

```text
[master c73cc45] feat: adapt java python execution for web public version
16 files changed, 158 insertions(+), 65 deletions(-)
```

Windows 下出现以下提示不用慌：

```text
LF will be replaced by CRLF the next time Git touches it
```

这是换行符提示，不是错误。

每完成一个阶段都应该执行：

```powershell
git status
git add .
git commit -m "清晰的阶段性提交信息"
```

---

## 6. 当前下一步：阶段 3A

当前下一步不是直接接入 SQL.js，而是先做：

```text
阶段 3A：SQL.js 接入前兼容性审计
```

原因：

当前 SQL 模块使用的是 `MockSQLEngine`，它是正则/模拟型 SQL 引擎，可能比较宽松。

后续改成 `sql.js / SQLite WASM` 后，会变成真实 SQLite，引擎会严格检查：

- 表名是否存在
- 字段名是否存在
- SQL 语法是否兼容
- MySQL 方言是否能在 SQLite 跑
- 题库和实际数据结构是否一致

Codex 之前指出潜在问题：

```text
题目可能使用 email、address、ord_id
实际数据可能使用 city、order_id
```

所以不能直接上 SQL.js，否则可能导致大量旧题突然报错。

---

## 7. 阶段 3A 给 AI / Codex 的提示词

把下面这段发给 Codex / Claude Code / Gemini，用于继续任务：

```text
现在开始阶段3A：SQL.js 接入前兼容性审计。

当前目录是：

E:\项目\sql-learning-hub-web-public

阶段0安全清理和阶段2 Java/Python 远程执行适配已经完成，并且已经 Git commit 保存。

这一步只做分析，不要修改代码。

目标：
在接入 sql.js / SQLite WASM 之前，完整分析当前 SQL 学习模块、题库、MockSQLEngine 和数据结构之间的兼容性，避免直接替换后导致大量课程和题目失效。

请分析：

1. 当前 SQL 执行链
   - SQL 运行按钮在哪里
   - app.js 中 SQL 执行入口在哪里
   - MockSQLEngine.execute() 返回格式是什么
   - UI 依赖哪些字段，例如 success、columns、rows、message、error

2. 当前数据结构
   - DB_SCHEMA 有哪些表
   - DB_DATA 有哪些表
   - 每张表有哪些字段
   - 当前 MockSQLEngine 支持哪些 SQL 语法

3. 题库兼容性
   - 扫描 SQL 课程、SQL 题库、SQL 考试题中出现的表名和字段名
   - 找出题目里引用但 DB_DATA / DB_SCHEMA 不存在的表名
   - 找出题目里引用但实际数据不存在的字段名
   - 找出 MySQL 语法但 SQLite 不直接支持的语法

4. SQL.js 替换风险
   - 哪些功能可以直接替换
   - 哪些功能需要 MySQL 兼容层
   - 哪些题目需要数据别名或兼容视图
   - 哪些地方不能改课程内容，只能通过适配层兼容

5. 输出阶段3B实施方案
   - 新增哪些文件
   - 修改哪些文件
   - 如何保持 MockSQLEngine 原返回格式
   - 如何初始化 SQLite 数据库
   - 如何处理重置数据库
   - 如何处理 AUTO_INCREMENT、NOW()、CONCAT()、RIGHT JOIN 等兼容问题
   - 如何批量测试所有 SQL 题目

限制：
- 不要修改代码
- 不要改课程内容
- 不要改题库
- 不要改 CSS
- 不要改 Java/Python
- 不要改 PWA
- 不要引入 React/Vite

完成后请给我：
1. SQL执行链说明
2. 当前表结构清单
3. 表名/字段名不一致问题清单
4. SQLite不兼容语法清单
5. 推荐的 SQL.js 接入方案
6. 风险等级
7. 阶段3B可执行修改计划
```

---

## 8. 后续路线图

当前进度：

```text
✅ 阶段0：安全清理
✅ 阶段2：Java/Python 远程执行适配
✅ Git commit 保存
➡️ 阶段3A：SQL.js 接入前兼容性审计
⬜ 阶段3B：接入 SQL.js / SQLite WASM
⬜ 阶段4：响应式布局
⬜ 阶段5：PWA 完善
⬜ 阶段6：部署上线
```

推荐顺序：

```text
阶段3A：SQL兼容性审计，只分析
↓
阶段3B：SQL.js 适配器，小步修改
↓
阶段3C：SQL题库批量测试
↓
阶段4A：响应式布局审计，只分析
↓
阶段4B：手机/平板布局改造
↓
阶段5A：PWA缓存策略审计
↓
阶段5B：Service Worker 和图标完善
↓
阶段6：Cloudflare Pages 部署
```

---

## 9. 项目约束

所有后续 AI 编程都必须遵守：

```text
不要重写整个项目
不要引入 React/Vite/Next
不要一次性大改
不要修改课程和题库内容，除非明确要求
不要把 Web 版和桌面完整版混在一起
不要重新引入本地 python.exe
不要重新引入本地 JDK
不要重新依赖 server.py
不要把 Token 写进前端
不要提交 .env / .dev.vars
不要直接公开 data/study_ai.db
```

每次只做一个阶段：

```text
先分析
再小步修改
再测试
再 git commit
```

---

## 10. 两个版本的分工

### 桌面完整版

路径：

```text
E:\项目\sql-learning-hub
```

保留：

```text
本地 Python
本地 JDK
server.py
study_ai.py
Study-Tools.exe
离线完整功能
本地 AI / 本地数据库
```

### Web公开版

路径：

```text
E:\项目\sql-learning-hub-web-public
```

保留：

```text
课程阅读
题库练习
SQL练习
Java/Python远程执行
PWA
手机适配
公开部署能力
```

不允许包含：

```text
本地 Python
本地 JDK
server.py
study_ai.py
Study-Tools.exe
study_ai.db
浏览器 profile
缓存
Token
日志
```

---

## 11. 同步策略

目前两个目录是分开的。

完整版新增课程/题库后，不会自动同步到 Web 版。

推荐短期策略：

```powershell
$Desktop = "E:\项目\sql-learning-hub"
$Web = "E:\项目\sql-learning-hub-web-public"

robocopy "$Desktop\data" "$Web\data" /E
robocopy "$Desktop\textbooks" "$Web\textbooks" /E
robocopy "$Desktop\tools" "$Web\tools" /E

Write-Host "✅ 已同步 data / textbooks / tools 到 Web公开版"
```

注意：

- 暂时不要同步整个 `assets`
- 不要同步 `python/`
- 不要同步 `jdk/`
- 不要同步 `server.py`
- 不要同步 `study_ai.py`
- 不要同步 `Study-Tools.exe`
- 不要同步 `data/study_ai.db`

---

## 12. 当前最重要的提醒

下一步只做：

```text
阶段3A：SQL.js 接入前兼容性审计
```

不要让 AI 同时做：

```text
SQL.js
响应式
PWA
部署
UI重构
```

否则容易爆改项目。

正确节奏：

```text
分析 → 小改 → 测试 → commit
```
