# Study Tools Web Public 版 - 维护者自述

这个目录是从桌面完整版拆出来的 Web/PWA 公开版，用于在 Cloudflare Pages 等平台上面向公网进行静态化部署。

## 📌 当前版本配置

* **对应 Windows Release 版本**：`v2026.6.11`
* **主项目 Release URL**：[IT Study Tools Release v2026.6.11](https://github.com/bwins0668/it-study-tools/releases/tag/v2026.6.11)
* **线上部署地址**：[https://study-tools-web-pages.pages.dev](https://study-tools-web-pages.pages.dev)
* **最近同步来源**：主项目 `fa9c0c6` / Web 公开版 commit `bb75fa7`

---

## 🛠️ Web 版专有架构与逻辑

1. **SQLite WASM 引擎**
   * 本地静态资源通过 `assets/vendor/sql-wasm.js` 和 `sql-wasm.wasm` 实现纯游览器内的 SQLite 关系型数据库运行。不依赖本地 `sqlite3` 后端。
2. **PWA / Service Worker**
   * 使用 `service-worker.js` 和 `manifest.webmanifest` 缓存 20 个翻译静态包和 IT 术语表，支持 100% 离线运行。
3. **Web CodeRunner 安全降级**
   * 移除了本地 JDK 与 Python 后端，执行代码时接口（`/api/execute`）失败会触发 `code-runner-api.js` 抛出 `"尚未配置"` 错误，从而引导展示 Web Safe Mode 提示并提供完整版下载链接。
4. **移动端适配优化**
   * `assets/css/index.css` 包含移动端折叠抽屉目录导航，及堆叠对照自适应布局。
5. **AI 翻译 API 静默降级**
   * 在公网 Web 运行环境下（通过 `isWebPublicRuntime()` 识别），自动跳过向 `/api/i18n/translate` 发送翻译请求并直接返回空对象以进行静默降级，彻底消除了控制台和 smoke test 中产生的 405 preflight 错误噪音，且不影响已有静态多语言包的渲染与加载。
6. **定制 1200x630 OG 社交卡片**
   * 将社交媒体分享图从默认的 512px app icon 升级为定制 1200x630 社交分享预览图 `og-study-tools-v2026-6-11.png`，并适配 `summary_large_image` Twitter 卡片，大幅提升在 X (Twitter)、Facebook 等平台分享时的视觉体验。
7. **静态资源与懒加载包 Cache Busting 机制**
   * 设计了针对 Vanilla JS 静态架构的即时缓存击穿机制。在 `version.js` 中全局注入 `assetVersion: "v2026.6.11-r13.10"`，并将所有核心 CSS/JS 资源及 `ContentI18n.loadPack` 动态加载的语言包路径拼接 `?v=[assetVersion]`。
   * 在 `service-worker.js` 中升级 CACHE_NAME 为 `study-tools-web-v2026-6-11-r13-10`，并针对含版本参数的请求取消 `ignoreSearch` 模糊匹配，确保文件更新时能在首次加载即时下载生效。

---

## 🚫 严禁同步的排除清单

在未来的任何同步轮次中，**绝对不要**把以下文件或文件夹复制到 Web 公开版：
* **二进制与启动脚本**：`Study-Tools.exe`、`启动.bat`、`tree.txt`；
* **本地编译环境**：`python/`、`jdk/`、`textbooks/`（体积巨大且涉版权）；
* **本地开发数据**：`data/study_ai.db`（包含测试脏数据及隐私信息）；
* **核心服务端逻辑**：`server.py`、`study_ai.py`；
* **临时及配置文件夹**：`tools/`、`scratch/`、`backups/`、`output/`、`node_modules/`、`.git/`。
* **本地 Sandboxes 样式/配置**：不要覆盖 Web 版特有的 `assets/css/index.css`、`java_sandbox.js`、`python_sandbox.js` 和 `package.json`。

---

## 🔄 下一次同步与发布流程

当桌面主项目（`E:\项目\sql-learning-hub`）更新了静态翻译包或 UI 字典，需要同步到 Web 公开版时，请按以下步骤操作：

1. **环境检查**：确认两个项目工作区均为 clean。
2. **执行备份**：在 `E:\项目\web-public-backups\` 目录下创建时间戳备份文件夹。
3. **定向同步**：
   * 将主项目 `data/i18n_content/` 下 20 个多语言包复制到 Web 版对应目录。
   * 将主项目 `data/glossary/` 下 `it_terms.js` 复制到 Web 版。
   * 直接覆盖：`assets/js/i18n.js`、`assets/js/content-i18n.js`、`assets/js/i18n-ui-dict.js`、`assets/js/glossary.js`、`assets/css/glossary.css`。
4. **手动合并 index.html 与 app.js**：
   * 在 `index.html` 的合适位置追加 script 引用，切勿直接覆盖。
   * 在 `app.js` 中合并最新的 `getLessonLocalizedText` 方法及 `formatMarkdown` 升级逻辑，保持 WASM 与 WebCodeRunner 降级不受影响。
5. **本地 smoke test**：在 Web 目录运行 `npm run dev`（5173端口），使用 Playwright/游览器进行多语言拦截、WASM 执行、术语表点击抽查。
6. **Git Precise Add**：严禁执行 `git add .` 或 `-A`，逐个精确 add 改动的文件。
7. **Commit & Push**：提交修改并 push 到 `origin master`，Cloudflare Pages 将自动完成发布。
