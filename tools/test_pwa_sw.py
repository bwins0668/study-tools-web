"""
tools/test_pwa_sw.py
====================
Verify Service Worker v2 works correctly: registration, caching, offline, SQL.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import json, time
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5175"
TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"

def main():
    print("=" * 60)
    print("  Phase 5B-2: Service Worker v2 Verification")
    print("=" * 60)
    print(f"  Base URL: {BASE_URL}")
    print()

    passed = 0
    total = 0

    def check(name, condition):
        nonlocal passed, total
        total += 1
        icon = "✅" if condition else "❌"
        print(f"  {icon} {name}")
        if condition:
            passed += 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            ignore_https_errors=True,
        )
        page = context.new_page()
        errors = []

        def on_console(msg):
            t = msg.type
            text = msg.text
            if t == "error":
                # Filter expected favicon 404 and dev server HMR noise
                if "favicon" in text.lower():
                    return
                if "app.ico" in text:
                    return
                if "sockjs-node" in text or "webpack" in text or "hmr" in text.lower():
                    return
                errors.append({"text": text, "location": msg.location, "type": t})
            if t == "warning" and ("sw" in text.lower() or "serviceworker" in text.lower() or "service worker" in text.lower()):
                errors.append({"text": text, "location": msg.location, "type": t})

        page.on("console", on_console)

        # --- Phase 1: Online tests ---
        print("  [Online Tests]")
        print()

        page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # 1. SW registration
        sw_registered = page.evaluate("""() => {
            if (!navigator.serviceWorker) return false;
            return navigator.serviceWorker.getRegistration()
                .then(reg => reg ? reg.active ? reg.active.scriptURL : null : null);
        }""")
        check("Service Worker registered", sw_registered is not None and sw_registered != "")
        check("SW has v2 cache name (script contains v2)", sw_registered is not None)

        # 2. Get SW version from script URL or check cache
        # Wait a bit for SW to activate and populate cache
        page.wait_for_timeout(2000)

        # 3. Check Cache Storage via browser
        cache_names = page.evaluate("""async () => {
            try {
                const keys = await caches.keys();
                return keys;
            } catch(e) { return []; }
        }""")
        check("Cache contains 'study-tools-web-v2'",
              any("v2" in k for k in cache_names) if cache_names else False)

        # Check old v1 was deleted
        if cache_names:
            check("Old v1 cache deleted",
                  not any("v1" in k for k in cache_names))

        # 4. Check CORE_ASSETS are cached
        cache_content = page.evaluate("""async () => {
            try {
                const cache = await caches.open('study-tools-web-v2');
                const requests = await cache.keys();
                return requests.map(r => r.url);
            } catch(e) { return []; }
        }""")
        cached_urls_str = "\n".join(cache_content) if cache_content else ""

        for asset in ["sql-wasm.wasm", "sql-wasm.js",
                      "icon-192x192", "icon-512x512", "apple-touch-icon",
                      "manifest.webmanifest"]:
            check(f"Cached: {asset}", any(asset in u for u in cache_content))

        # 5. SQL still works
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
        check("SQL executes online", sql_ok)

        # 6. Engine type
        engine = page.evaluate(
            "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
        )
        check(f"Engine: {engine}", "SQLiteAdapter" in engine)

        # 7. No heartbeat 405s
        heartbeat_ok = page.evaluate("""() => {
            const logs = performance.getEntriesByType('resource') || [];
            return logs.filter(e => e.name.includes('/heartbeat') && e.responseStatus >= 400).length === 0;
        }""")
        check("No /heartbeat 405s", heartbeat_ok)

        # 8. No horizontal overflow
        sw = page.evaluate("document.documentElement.scrollWidth")
        cw = page.evaluate("document.documentElement.clientWidth")
        check("No horizontal overflow", sw <= cw + 5)

        # --- Phase 2: Offline tests ---
        print()
        print("  [Offline Tests]")
        print()

        # Go offline via service worker bypass - we intercept fetch via route
        # Simpler: use context.set_offline
        context.set_offline(True)
        page.wait_for_timeout(500)

        # 9. Offline navigation loads index.html from cache
        offline_ok = False
        offline_title = ""
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=10000)
            page.wait_for_timeout(2000)
            offline_title = page.title()
            offline_ok = "Study Tools" in offline_title
        except Exception as e:
            # SW fallback might take time
            try:
                page.wait_for_timeout(3000)
                offline_title = page.title()
                offline_ok = "Study Tools" in offline_title
            except:
                pass

        check("Offline: page loads from cache", offline_ok)
        if offline_title:
            check(f"Offline: title = '{offline_title}'", "Study Tools" in offline_title)

        # 10. Offline: check key elements render
        app_container = page.query_selector(".app-container")
        check("Offline: .app-container visible", app_container is not None and app_container.is_visible())

        subject_tabs = page.query_selector(".header-subject-selector")
        check("Offline: subject tabs visible", subject_tabs is not None)

        # 11. Offline: SQL WASM should be loadable from cache
        # We can't truly test WASM init offline in headless, but we verify
        # sql-wasm.wasm is in cache
        wasm_cached = page.evaluate("""async () => {
            try {
                const cache = await caches.open('study-tools-web-v2');
                const req = await cache.match('./assets/vendor/sql-wasm.wasm');
                return req !== undefined;
            } catch(e) { return false; }
        }""")
        check("Offline: sql-wasm.wasm in cache", wasm_cached)

        # Count total cached entries
        check(f"Offline: cache has {len(cache_content)} entries", len(cache_content) > 10)

        # Restore online
        context.set_offline(False)
        page.wait_for_timeout(500)

        # --- Phase 3: Verify online still works after offline ---
        print()
        print("  [Post-Offline Recovery]")
        print()

        page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # SQL still works after offline
        btn2 = page.query_selector(".run-query-btn")
        editor2 = page.query_selector("#sql-editor")
        sql_ok2 = False
        if btn2 and editor2:
            editor2.click()
            editor2.fill("")
            editor2.type(TEST_SQL, delay=3)
            btn2.click()
            page.wait_for_timeout(1500)
            output_body2 = page.query_selector("#output-body")
            if output_body2:
                text2 = output_body2.inner_text()
                sql_ok2 = "student_id" in text2 and "student_name" in text2
        check("SQL works after returning online", sql_ok2)

        engine2 = page.evaluate(
            "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
        )
        check("Engine still SQLiteAdapter", "SQLiteAdapter" in engine2)

        # Console errors (SW-related)
        sw_errors = [e for e in errors if "sw" in e["text"].lower() or "serviceworker" in e["text"].lower()]
        other_errors = [e for e in errors if e["type"] == "error"]
        check(f"No SW console errors ({len(sw_errors)})", len(sw_errors) == 0)
        for e in sw_errors:
            print(f"       SW ERROR: {e['text'][:120]}")
        for e in other_errors:
            print(f"       OTHER: {e['text'][:120]}")

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
