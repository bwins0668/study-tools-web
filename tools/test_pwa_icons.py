"""
tools/test_pwa_icons.py
========================
Quick verification that PWA icon changes haven't broken anything.
Tests: manifest loading, page load, SQL execution, console errors.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import json
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5175"
TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"

def main():
    print("=" * 60)
    print("  Phase 5B-1: PWA Icons Verification")
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
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        errors = []

        def on_console(msg):
            if msg.type == "error":
                # Filter out expected .ico 404s (not a real problem)
                if "app.ico" not in msg.text:
                    errors.append({"text": msg.text, "location": msg.location})

        page.on("console", on_console)

        # 1. Load page
        page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # 2. Check manifest link exists in DOM
        manifest_link = page.query_selector('link[rel="manifest"]')
        check("manifest <link> exists", manifest_link is not None)
        if manifest_link:
            check("manifest href is correct",
                  manifest_link.get_attribute("href") == "./manifest.webmanifest")

        # 3. Check apple-touch-icon
        apple_icon = page.query_selector('link[rel="apple-touch-icon"]')
        check("apple-touch-icon <link> exists", apple_icon is not None)

        # 4. Check iOS meta tags
        for meta_name in ["apple-mobile-web-app-capable",
                          "apple-mobile-web-app-status-bar-style",
                          "mobile-web-app-capable"]:
            el = page.query_selector(f'meta[name="{meta_name}"]')
            check(f'<meta name="{meta_name}"> exists', el is not None)

        # 5. Check apple-mobile-web-app-title
        title_meta = page.query_selector('meta[name="apple-mobile-web-app-title"]')
        check('apple-mobile-web-app-title exists', title_meta is not None)
        if title_meta:
            check('apple-mobile-web-app-title = "StudyTools"',
                  title_meta.get_attribute("content") == "StudyTools")

        # 6. Check viewport-fit=cover
        vp = page.query_selector('meta[name="viewport"]')
        check("viewport-fit=cover present",
              vp is not None and "viewport-fit=cover" in (vp.get_attribute("content") or ""))

        # 7. Check manifest JSON is valid
        manifest_url = BASE_URL + "/manifest.webmanifest"
        resp = page.evaluate(f"fetch('{manifest_url}').then(r => r.json())")
        check("manifest JSON valid", resp is not None)
        check("manifest has icons", len(resp.get("icons", [])) >= 5)
        check("manifest has 192x192 PNG",
              any(i["sizes"] == "192x192" and i["type"] == "image/png" for i in resp.get("icons", [])))
        check("manifest has 512x512 PNG",
              any(i["sizes"] == "512x512" and i["type"] == "image/png" for i in resp.get("icons", [])))
        check("manifest has maskable icons",
              any(i.get("purpose") == "maskable" for i in resp.get("icons", [])))
        check("manifest has categories",
              "education" in resp.get("categories", []))

        # 8. Apple touch icon file exists (fetch HEAD)
        icon_resp = page.evaluate("""async () => {
            try {
                const r = await fetch('./assets/images/icons/apple-touch-icon.png', {method: 'HEAD'});
                return {ok: r.ok, type: r.headers.get('content-type')};
            } catch(e) { return {ok: false, error: e.message}; }
        }""")
        check("apple-touch-icon.png accessible", icon_resp.get("ok"))

        # 9. Check no horizontal overflow
        sw = page.evaluate("document.documentElement.scrollWidth")
        cw = page.evaluate("document.documentElement.clientWidth")
        check("no horizontal overflow", sw <= cw + 5)

        # 10. Check SQL still works
        btn = page.query_selector(".run-query-btn")
        editor = page.query_selector("#sql-editor")
        if btn and editor:
            editor.click()
            editor.fill("")
            editor.type(TEST_SQL, delay=3)
            btn.click()
            page.wait_for_timeout(1000)
            output_body = page.query_selector("#output-body")
            if output_body:
                text = output_body.inner_text()
                has_data = "student_id" in text and "student_name" in text
                check("SQL executes successfully", has_data)

        # 11. Check SQLiteAdapter engine
        engine = page.evaluate(
            "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
        )
        check(f"Engine: {engine}", "SQLiteAdapter" in engine)

        # 12. Check service-worker registration script still present
        sw_script = page.evaluate("""() => {
            const scripts = document.querySelectorAll('script');
            for (const s of scripts) {
                if (s.textContent && s.textContent.includes('serviceWorker')) {
                    return true;
                }
            }
            return false;
        }""")
        check("service-worker registration code present", sw_script)

        # 13. Check manifest icon PNGs are reachable
        for icon_name in ["icon-192x192.png", "icon-512x512.png",
                          "icon-192x192-maskable.png", "icon-512x512-maskable.png"]:
            result = page.evaluate(f"""async () => {{
                try {{
                    const r = await fetch('./assets/images/icons/{icon_name}', {{method: 'HEAD'}});
                    return r.ok;
                }} catch(e) {{ return false; }}
            }}""")
            check(f"{icon_name} accessible", result)

        # 14. Console errors
        new_errors = [e for e in errors if "favicon" not in e["text"].lower()]
        check(f"No unexpected console errors ({len(new_errors)})", len(new_errors) == 0)
        for e in new_errors:
            print(f"       ERROR: {e['text'][:100]}")

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
