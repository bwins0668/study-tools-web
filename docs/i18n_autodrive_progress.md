# I18n Autodrive Progress

更新时间：2026-06-19 23:51 JST

当前小轮次：
- Subround 4：Web 韩语 Python 内容包终审 + PC 同步

已完成：
- Subround 0：双端只读基线审计完成，Web/PC 均已 `git pull --ff-only` 且远端同步。
- Subround 1：增强 `tools/verify_i18n_coverage_matrix.js`，新增韩语专项明细：
  - SQL / Java / Python / IT Passport / SG
  - Glossary
  - Coding typing
  - Japanese typing
  - Tools Dashboard
  - Account / Settings / Tools
  - Toast / aria / title
- Subround 2：补齐韩语 SQL 内容包终审字段：
  - 36 课 `playgroundTask`
  - 36 课 `practicalExamTitle`
  - 36 课 `practicalExamDescription`
  - 运行时 `pickLessonLocalText` 会优先读取 lesson locale，再读取离线内容包字段，避免韩语 SQL 练习/实战考试文案回退到中文。
  - 版本同步到 `v2026.6.19-r-ko-sql-final`，并刷新 i18n manifest / asset manifest hash。
- Subround 3：重建 Web Java 韩语内容包并同步 PC：
  - 115 课本地韩语 `title` / `subtitle` / `concept`
  - 115 课 `practiceIntro` / `sandboxInstruction` / `examIntro` / `challengeIntro`
  - 每课至少 3 条 `keyPoints`
  - `coverageStatus` 标为 `usable-ko`，不再暴露 `needsReview/starter`
  - Web 版本同步到 `v2026.6.19-r-ko-java-pack`
  - PC 版本同步到 `v2026.6.19-r-pc-ko-java-sync`
  - 覆盖矩阵新增 `USABLE` 状态，避免把可用但未人工终审的内容误标为 FULL。
  - 新增 `tools/verify_ko_java_pack.js`。
- Subround 4：重建 Web Python 韩语内容包并同步 PC：
  - 255 课本地韩语 `title` / `subtitle` / `concept`
  - 255 课 `practiceIntro` / `sandboxInstruction` / `examIntro` / `challengeIntro`
  - 每课至少 3 条 `keyPoints`
  - `coverageStatus` 标为 `usable-ko`，不再暴露 `needsReview/starter`
  - Web 版本同步到 `v2026.6.19-r-ko-python-pack`
  - PC 版本同步到 `v2026.6.19-r-pc-ko-python-sync`
  - 新增 `tools/verify_ko_python_pack.js`。

已验证：
- 双端自定义韩语 SQL 内容审计：36 lessons / 36 ko rows / 0 issues。
- Web Subround 2 `node --check`：`assets/js/app.js`、`data/i18n_content/sql_ko.js`、`assets/js/version.js`、`service-worker.js` PASS。
- Web `git diff --check`：PASS。
- Web `node tools/verify_sql_ko_content_complete.js`：16 PASS / 0 FAIL / 0 WARN。
- Web `node tools/verify_i18n_coverage_matrix.js`：39 PASS / 0 FAIL / 34 WARN。
- Web `node tools/verify_i18n_minor_pack_patch.js`：30 PASS / 0 FAIL / 2 WARN。
- Web `node tools/verify_coding_typing.js`：PASS。
- Web `node tools/verify_sandbox_globals.mjs`：PASS，保留既有 inline handler / script order WARN。
- Web Subround 4 `node --check`：`data/i18n_content/python_ko.js`、`tools/verify_ko_python_pack.js`、`tools/verify_i18n_coverage_matrix.js`、`assets/js/version.js`、`service-worker.js` PASS。
- Web Subround 4 `git diff --check`：PASS。
- Web `node tools/verify_ko_python_pack.js`：8 PASS / 0 FAIL。
- Web `node tools/verify_i18n_coverage_matrix.js`：Python ko = USABLE，255/255 local，0/255 fallback。
- Web `node tools/verify_all_language_content_switch.js`：70 PASS / 0 FAIL / 0 WARN。
- Web `node tools/verify_offline_i18n_switch.js`：翻译 API 请求 0。
- Web `node tools/verify_coding_typing.js`：PASS。
- Web `node tools/verify_sandbox_globals.mjs`：PASS，保留既有 inline handler / script order WARN。
- Web browser i18n：`verify_all_language_content_switch.js` 70 PASS / 0 FAIL / 0 WARN。
- Web offline i18n：翻译 API 请求 0，所有目标语言 local content PASS。
- Web mobile layout：12 PASS / 0 FAIL。
- Web `node --check`：67 个 JS 文件 PASS。
- Web `node tools/verify_i18n_coverage_matrix.js`：39 PASS / 0 FAIL / 34 WARN。
- Web browser i18n：`verify_all_language_content_switch.js` 70 PASS / 0 FAIL / 0 WARN。
- Web offline i18n：翻译 API 请求 0。
- Web mobile layout：12 PASS / 0 FAIL。
- Web Subround 3 `node --check`：`data/i18n_content/java_ko.js`、`tools/verify_ko_java_pack.js`、`tools/verify_i18n_coverage_matrix.js`、`assets/js/version.js`、`service-worker.js` PASS。
- Web Subround 3 `git diff --check`：PASS。
- Web `node tools/verify_ko_java_pack.js`：8 PASS / 0 FAIL。
- Web `node tools/verify_i18n_coverage_matrix.js`：Java ko = USABLE，115/115 local，0/115 fallback。
- Web `node tools/verify_all_language_content_switch.js`：70 PASS / 0 FAIL / 0 WARN。
- Web `node tools/verify_offline_i18n_switch.js`：翻译 API 请求 0。
- Web `node tools/verify_coding_typing.js`：PASS。
- Web `node tools/verify_sandbox_globals.mjs`：PASS，保留既有 inline handler / script order WARN。
- PC `node --check`：76 个 JS 文件 PASS。
- PC `node tools/verify_i18n_coverage_matrix.js`：39 PASS / 0 FAIL / 34 WARN。
- PC browser i18n：`verify_all_language_content_switch.js` 70 PASS / 0 FAIL / 0 WARN。
- PC offline i18n：翻译 API 请求 0，仍有 3 个 th fallback WARN。

已 commit：
- Web 覆盖矩阵提交：`3939d89 test(web): strengthen i18n coverage matrix`
- PC 覆盖矩阵提交：`27329d8 test(pc): strengthen i18n coverage matrix`
- Web 韩语 SQL 终审提交：`8380e5f chore(web): polish Korean SQL lesson pack`
- PC 韩语 SQL 同步提交：`66393f8 chore(pc): sync Korean SQL lesson polish`
- Web Java 提交：`c68e464 feat(web): complete Korean Java lesson pack`
- PC Java 提交：`2d12a38 feat(pc): sync Korean Java lesson pack`
- Subround 4 Python 提交：待本文件提交后记录。
- 进度文档：随本文件提交记录。

已 push：
- 本轮提交后推送到远端；恢复时以 `git status --short --branch` 无 ahead 为准。

下一小轮次：
- Subround 5：Coding Typing 韩语 UI 11 个缺口修复 + PC 同步。

未完成原因：
- Web 韩语 IT Passport / SG 仍为 STARTER。
- PC 韩语 IT Passport / SG 仍为 FALLBACK。
- Korean Coding typing UI 仍为 STARTER：80/91 keys，11 missing。

恢复命令：
```powershell
Set-Location "G:\项目\sql-learning-hub-web-public"
git status --short --branch
node tools/verify_i18n_coverage_matrix.js

Set-Location "G:\项目\sql-learning-hub"
git status --short --branch
node tools/verify_i18n_coverage_matrix.js
```
