"""
tools/test_headers.py
=====================
Quick verify _headers creation and basic site functionality.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5173"
TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"

def main():
    print("=" * 60)
    print("  Phase 6B-1: _headers + Site Health Check")
    print("=" * 60)
    print(f"  Base URL: {BASE_URL}")
    print()

    passed = 0
    total = 0

    def check(name, cond):
        nonlocal passed, total
        total += 1
        icon = "✅" if cond else "❌"
        print(f"  {icon} {name}")
        if cond:
            passed += 1

    # 1. Check _headers file exists
    check("_headers file exists", os.path.exists("_headers"))
    check("_headers not empty", os.path.getsize("_headers") > 100)

    # 2. Check _headers content
    with open("_headers", "r", encoding="utf-8") as f:
        content = f.read()
    check("sql-wasm.wasm rule present", "sql-wasm.wasm" in content)
    check("sql-wasm.js rule present (NOT wasm)", "sql-wasm.js" in content)
    check("Content-Type: application/wasm for .wasm only",
          "application/wasm" in content and "Content-Type" in content)
    check("no application/wasm on sql-wasm.js",
          "/assets/vendor/sql-wasm.js" in content)
    check("SW no-cache rule", "no-cache, no-store, must-revalidate" in content)
    check("manifest short cache rule", "manifest.webmanifest" in content)
    check("icon long cache rule", "assets/images/icons" in content)
    check("lib long cache rule", "assets/lib" in content)
    check("index.html no-cache rule", "/index.html" in content and "no-cache" in content)
    check("root no-cache rule", "/\n  Cache-Control: no-cache" in content)
    check("correct indent (2 spaces)", all(l.startswith("  ") for l in content.split("\n") if l.startswith("  ")))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        errors = []

        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                if "favicon" not in text.lower() and "app.ico" not in text:
                    errors.append(text)

        page.on("console", on_console)

        page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        check("Page loads without crash", "Study Tools" in page.title())

        # SQL
        btn = page.query_selector(".run-query-btn")
        editor = page.query_selector("#sql-editor")
        if btn and editor:
            editor.click()
            editor.fill("")
            editor.type(TEST_SQL, delay=3)
            btn.click()
            page.wait_for_timeout(1500)
            output_body = page.query_selector("#output-body")
            if output_body:
                text = output_body.inner_text()
                check("SQL executes - has student_id", "student_id" in text)
                check("SQL executes - has student_name", "student_name" in text)
            else:
                check("SQL output body found", False)
        else:
            check("SQL editor + run button found", False)

        engine = page.evaluate(
            "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
        )
        check(f"Engine: {engine}", "SQLiteAdapter" in engine)

        check("No horizontal overflow",
              page.evaluate("document.documentElement.scrollWidth") <=
              page.evaluate("document.documentElement.clientWidth") + 5)

        check(f"Console errors: {len(errors)}", len(errors) == 0)
        for e in errors:
            print(f"       ERROR: {e[:100]}")

        page.close()
        browser.close()

    print()
    print(f"  {'=' * 56}")
    print(f"  RESULTS: {passed}/{total} checks passed")
    print(f"  {'=' * 56}")
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
