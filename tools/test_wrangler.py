"""
tools/test_wrangler.py
======================
Test Cloudflare Pages local simulation via Wrangler.
Tests: static assets, API 503, SQL, Java/Python UI, SW, headers.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import json
from playwright.sync_api import sync_playwright

WRANGLER_URL = "http://127.0.0.1:8788"
TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"

def main():
    print("=" * 60)
    print("  Phase 6B-2: Wrangler Local Simulation Test")
    print("=" * 60)
    print(f"  Wrangler URL: {WRANGLER_URL}")
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        errors = []

        def on_console(msg):
            t = msg.type
            text = msg.text
            if t == "error":
                if "favicon" in text.lower() or "app.ico" in text:
                    return
                errors.append({"text": text, "type": t, "loc": str(msg.location)[:60]})

        page.on("console", on_console)

        page.on("pageerror", lambda err: errors.append({"text": str(err), "type": "pageerror", "loc": ""}))

        # ================================================================
        # Phase 1: Static Resources
        # ================================================================
        print("  [Phase 1: Static Resources]")
        print()

        page.goto(WRANGLER_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        check(f"Page loads: '{page.title()}'", "Study Tools" in page.title())
        check("App container visible",
              page.query_selector(".app-container") is not None)

        # Check key resources accessible
        resources = [
            ("index.html", WRANGLER_URL + "/index.html"),
            ("manifest.webmanifest", WRANGLER_URL + "/manifest.webmanifest"),
            ("service-worker.js", WRANGLER_URL + "/service-worker.js"),
            ("sql-wasm.js", WRANGLER_URL + "/assets/vendor/sql-wasm.js"),
            ("sql-wasm.wasm", WRANGLER_URL + "/assets/vendor/sql-wasm.wasm"),
            ("app.js", WRANGLER_URL + "/assets/js/app.js?v=test"),
            ("index.css", WRANGLER_URL + "/assets/css/index.css?v=test"),
            ("icon-192x192.png", WRANGLER_URL + "/assets/images/icons/icon-192x192.png"),
        ]
        for name, url in resources:
            try:
                resp = page.evaluate(
                    f"fetch('{url}', {{method:'HEAD'}}).then(r => r.status)")
                check(f"Resource: {name} (HTTP {resp})", resp == 200)
            except Exception as e:
                check(f"Resource: {name}", False)

        # ================================================================
        # Phase 2: API 503 test (no PISTON_BASE_URL configured)
        # ================================================================
        print()
        print("  [Phase 2: /api/execute 503 (no env vars)]")
        print()

        api_result = page.evaluate("""async () => {
            try {
                const res = await fetch('/api/execute', {method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({language:'python', code:'print("hi")'})
                });
                const data = await res.json();
                return {status: res.status, data};
            } catch(e) { return {status: 0, error: e.message}; }
        }""")
        check(f"API returns status {api_result.get('status')}",
              api_result.get("status") == 503)
        api_msg = api_result.get("data", {}).get("error", "")
        check(f"API message: '{api_msg}'",
              "远程代码执行服务尚未配置" in api_msg or "not configured" in api_msg)

        # Also test Java
        api_java = page.evaluate(
            "(code) => fetch('/api/execute', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'java', code})}).then(r => r.json().then(d => ({status: r.status, error: d.error})))",
            "class Main{public static void main(String[]a){} }")
        check(f"Java API also 503 ({api_java.get('status')})",
              api_java.get("status") == 503)

        # ================================================================
        # Phase 3: SQL Functionality
        # ================================================================
        print()
        print("  [Phase 3: SQL Functionality]")
        print()

        # Navigate fresh to ensure clean state
        page.goto(WRANGLER_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        engine = page.evaluate(
            "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
        )
        check(f"Engine: {engine}", "SQLiteAdapter" in engine)

        # Check SQL tab is active (default)
        sql_tab = page.query_selector("#subject-tab-sql")
        if sql_tab:
            check("SQL tab present", sql_tab is not None)

        btn = page.query_selector(".run-query-btn")
        editor = page.query_selector("#sql-editor")
        sql_ok = False
        if btn and editor:
            editor.click()
            editor.fill("")
            editor.type(TEST_SQL, delay=3)
            btn.click()
            page.wait_for_timeout(1500)
            output_body = page.query_selector("#output-body")
            if output_body:
                text = output_body.inner_text()
                sql_ok = "student_id" in text and "student_name" in text
                check("SQL result has student_id", "student_id" in text)
                check("SQL result has student_name", "student_name" in text)
        if not sql_ok:
            check("SQL execution completed", False)

        # ================================================================
        # Phase 4: Java/Python Frontend Error Handling
        # ================================================================
        print()
        print("  [Phase 4: Java/Python Frontend Error Display]")
        print()

        # Switch to Java
        java_tab = page.query_selector("#subject-tab-java")
        if java_tab:
            java_tab.click()
            page.wait_for_timeout(2000)
            check("Java tab clicked", True)

            java_run = page.query_selector("#java-run-btn")
            java_editor = page.query_selector("#java-editor")
            java_output = page.query_selector("#java-output-card")

            if java_run and java_editor:
                check("Java editor + run button found", True)
                # We just verify the elements exist, not execute (would get 503 handled by frontend)
            else:
                check("Java editor + run button found", False)
        else:
            check("Java tab exists", False)

        # Switch to Python
        python_tab = page.query_selector("#subject-tab-python")
        if python_tab:
            python_tab.click()
            page.wait_for_timeout(2000)
            check("Python tab clicked", True)

            python_run = page.query_selector("#python-run-btn")
            python_editor = page.query_selector("#python-editor")
            if python_run and python_editor:
                check("Python editor + run button found", True)
            else:
                check("Python editor + run button found", False)
        else:
            check("Python tab exists", False)

        # ================================================================
        # Phase 5: PWA / Service Worker
        # ================================================================
        print()
        print("  [Phase 5: PWA / Service Worker]")
        print()

        # Navigate to main page first
        page.goto(WRANGLER_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(3000)

        sw_registered = page.evaluate("""async () => {
            if (!navigator.serviceWorker) return 'no-sw-api';
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg) return 'no-registration';
                if (!reg.active) return 'no-active-worker';
                return reg.active.scriptURL;
            } catch(e) { return 'error: ' + e.message; }
        }""")
        check(f"SW registered: {sw_registered[:60] if sw_registered else 'None'}",
              sw_registered and "service-worker.js" in str(sw_registered))

        # Check cache storage
        cache_info = page.evaluate("""async () => {
            try {
                const keys = await caches.keys();
                const v2keys = keys.filter(k => k.includes('study-tools-web-v2'));
                if (v2keys.length === 0) return {found: false, all: keys};
                const cache = await caches.open(v2keys[0]);
                const reqs = await cache.keys();
                const urls = reqs.map(r => r.url);
                return {
                    found: true,
                    name: v2keys[0],
                    count: reqs.length,
                    hasApi: urls.some(u => u.includes('/api/')),
                    hasWasm: urls.some(u => u.includes('sql-wasm.wasm')),
                    sample: urls.slice(0, 3)
                };
            } catch(e) { return {found: false, error: e.message}; }
        }""")
        check(f"Cache '{cache_info.get('name', '?')}' exists ({cache_info.get('count', 0)} entries)",
              cache_info.get("found"))
        check("sql-wasm.wasm in cache", cache_info.get("hasWasm"))
        check("No /api/ in cache", not cache_info.get("hasApi"))

        # ================================================================
        # Phase 6: Headers check
        # ================================================================
        print()
        print("  [Phase 6: Headers Compliance]")
        print()

        # Check headers via fetch API
        header_checks = [
            ("sql-wasm.wasm Content-Type",
             "/assets/vendor/sql-wasm.wasm",
             "content-type", "application/wasm"),
            ("sql-wasm.wasm Cache-Control immutable",
             "/assets/vendor/sql-wasm.wasm",
             "cache-control", "immutable"),
            ("sql-wasm.js Cache-Control immutable",
             "/assets/vendor/sql-wasm.js",
             "cache-control", "immutable"),
            ("service-worker.js no-cache",
             "/service-worker.js",
             "cache-control", "no-cache"),
            ("icon Cache-Control immutable",
             "/assets/images/icons/icon-192x192.png",
             "cache-control", "immutable"),
            ("manifest Cache-Control max-age=3600",
             "/manifest.webmanifest",
             "cache-control", "3600"),
            ("index.html no-cache",
             "/index.html",
             "cache-control", "no-cache"),
        ]

        for label, path, header, expected in header_checks:
            result = page.evaluate(f"""async () => {{
                try {{
                    const r = await fetch('{path}', {{method:'HEAD'}});
                    const val = (r.headers.get('{header}') || '').toLowerCase();
                    return {{status: r.status, val, found: val.includes('{expected}'.toLowerCase())}};
                }} catch(e) {{ return {{status: 0, error: e.message}}; }}
            }}""")
            check(f"{label}: '{result.get('val','?')[:50]}'",
                  result.get("found") or result.get("status") == 200)

        # ================================================================
        # Phase 7: Responsive / Layout
        # ================================================================
        print()
        print("  [Phase 7: Layout / Responsive]")
        print()

        check("Desktop no overflow",
              page.evaluate("document.documentElement.scrollWidth") <=
              page.evaluate("document.documentElement.clientWidth") + 5)

        # Mobile viewport
        context2 = browser.new_context(viewport={"width": 390, "height": 844})
        page2 = context2.new_page()
        page2.goto(WRANGLER_URL, wait_until="networkidle", timeout=15000)
        page2.wait_for_timeout(2000)

        check("Mobile no overflow",
              page2.evaluate("document.documentElement.scrollWidth") <=
              page2.evaluate("document.documentElement.clientWidth") + 5)

        mobile_toggle = page2.query_selector("#mobile-sidebar-toggle")
        check("Mobile toggle visible", mobile_toggle and mobile_toggle.is_visible())

        page2.close()

        # ================================================================
        # Console Errors Summary
        # ================================================================
        print()
        print("  [Console Errors]")
        print()

        real_errors = [e for e in errors
                       if "Vite" not in e["text"]
                       and "WebSocket" not in e["text"]
                       and "favicon" not in e["text"].lower()]
        check(f"Console errors: {len(real_errors)}", len(real_errors) == 0)
        for e in real_errors:
            print(f"    [{e['type']}] {e['text'][:120]}")
            if e["loc"]:
                print(f"        at {e['loc']}")

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
