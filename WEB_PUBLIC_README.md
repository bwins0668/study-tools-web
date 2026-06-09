# Study Tools Web Public 版

这个目录是从桌面完整版拆出来的 Web/PWA 公开版。

## 已完成

- 复制 index.html
- 复制 assets/
- 复制 data/
- 排除本地 jdk/
- 排除本地 python/
- 排除 Study-Tools.exe
- 添加 manifest.webmanifest
- 添加 service-worker.js
- 添加 assets/js/code-runner-api.js
- 添加 Cloudflare Pages Function: functions/api/execute.js

## 目标架构

SQL:
- 推荐后续改为 sql.js / SQLite WASM，在浏览器本地运行。

Python:
- 当前已提供 WebCodeRunner.runPython(code)
- 通过 /api/execute 调用免费函数代理。

Java:
- 当前已提供 WebCodeRunner.runJava(code)
- Java 代码文件名默认 Main.java，主类请使用 public class Main。

## 下一步必须做

需要把原来的 python_sandbox.js / java_sandbox.js 里面的本地调用，替换为：

await window.WebCodeRunner.runPython(code)

await window.WebCodeRunner.runJava(code)

不要再调用本地 python.exe。
不要再调用本地 JDK。
不要再依赖 server.py 本地执行代码。
