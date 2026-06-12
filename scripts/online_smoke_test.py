"""
Study Tools Web — Automated Online Smoke Test (Round 13.5)

Usage:
    python scripts/online_smoke_test.py

Dependencies:
    pip install playwright
    python -m playwright install chromium

Exit code:
    0 = ALL PASS
    1 = some FAIL items
"""

import sys
import io
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("FAIL: playwright not installed. Run:")
    print("  pip install playwright")
    print("  python -m playwright install chromium")
    sys.exit(1)

BASE_URL = "https://study-tools-web-pages.pages.dev"
if len(sys.argv) > 1:
    BASE_URL = sys.argv[1]
RELEASE_URL = "https://github.com/bwins0668/it-study-tools/releases/tag/v2026.6.11"

results = []
console_errors = []
network_404s = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    msg = f"  [{status}] {name}"
    if detail:
        msg += f"  # {detail}"
    results.append((name, status, detail))
    print(msg)


def switch_lang(page, code):
    """Click the language toggle button, then click language option by data-lang."""
    toggle = page.locator("#language-toggle-btn")
    if toggle.count() == 0:
        return False
    toggle.click()
    page.wait_for_timeout(500)
    opt = page.locator(f".language-option[data-lang=\"{code}\"]")
    if opt.count() > 0:
        opt.first.click()
        page.wait_for_timeout(2000)
        return True
    return False


def run():
    print("")
    print("=" * 60)
    print("  Study Tools Web — Online Smoke Test")
    print(f"  {BASE_URL}")
    print("=" * 60)
    print("")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        )
        page = context.new_page()

        console_errors.clear()
        network_404s.clear()
        network_405s = []
        requested_urls = []

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("response", lambda resp: network_404s.append(resp.url) if resp.status == 404 else None)
        page.on("response", lambda resp: network_405s.append(resp.url) if resp.status == 405 else None)
        page.on("request", lambda req: requested_urls.append(req.url))

        # ---- 1. Homepage HTTP 200 ----
        resp = page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        check("Homepage HTTP 200", resp and resp.status == 200,
              f"status={resp.status if resp else 'None'}")

        # ---- 2. Page title ----
        title = page.title()
        check("Page title contains 'Study Tools Web'", "Study Tools Web" in title,
              f"actual='{title}'")

        # ---- 3. Version display ----
        has_ver = page.locator("text=v2026.6.11").count() > 0
        check("Page shows v2026.6.11", has_ver)

        # ---- 4. Release link ----
        rel_link = page.locator(f'a[href="{RELEASE_URL}"]')
        check("Release link present", rel_link.count() > 0)

        # ---- 5. First-load: no i18n_content scripts in DOM ----
        no_script_packs = page.evaluate(
            "Array.from(document.querySelectorAll('script[src*=\"i18n_content\"]')).length === 0"
        )
        check("First-load: no i18n_content scripts in DOM", no_script_packs)

        # ---- 6. Switch to en-US, open SQL ----
        switch_lang(page, "en")
        page.evaluate("document.getElementById('subject-tab-sql')?.click()")
        time.sleep(2)
        has_en = page.evaluate(
            "window.CONTENT_I18N && window.CONTENT_I18N['sql:1'] && !!window.CONTENT_I18N['sql:1']['en']"
        )
        check("SQL + en-US: has en content for sql:1", has_en)

        # ---- 7. Switch to vi-VN ----
        switch_lang(page, "vi")
        page.evaluate("document.getElementById('subject-tab-sql')?.click()")
        time.sleep(2)
        has_vi = page.evaluate(
            "window.CONTENT_I18N && window.CONTENT_I18N['sql:1'] && !!window.CONTENT_I18N['sql:1']['vi']"
        )
        check("SQL + vi-VN: has vi content for sql:1", has_vi)

        # ---- 8. Switch to fr-FR, open Python ----
        switch_lang(page, "fr")
        page.evaluate("document.getElementById('subject-tab-python')?.click()")
        time.sleep(2)
        has_fr = page.evaluate(
            "window.CONTENT_I18N && window.CONTENT_I18N['python:1'] && !!window.CONTENT_I18N['python:1']['fr']"
        )
        check("Python + fr-FR: has fr content for python:1", has_fr)

        # ---- 9. Switch to ja-JP: no external packs ----
        script_packs_before = page.evaluate(
            "Array.from(document.querySelectorAll('script[src*=\"i18n_content\"]')).length"
        )
        switch_lang(page, "ja")
        time.sleep(2)
        script_packs_after = page.evaluate(
            "Array.from(document.querySelectorAll('script[src*=\"i18n_content\"]')).length"
        )
        check("ja-JP: no extra i18n_content scripts loaded",
              script_packs_after <= script_packs_before,
              f"scripts: {script_packs_before} -> {script_packs_after}")

        # ---- 10. Glossary modal ----
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
        glossary_btn = page.locator("#glossary-open-btn")
        g_ok = glossary_btn.count() > 0
        if g_ok:
            glossary_btn.click()
            page.wait_for_timeout(800)
            modal = page.locator(".glossary-dialog, #glossary-modal")
            g_ok = modal.count() > 0
            if g_ok:
                page.keyboard.press("Escape")
                page.wait_for_timeout(300)
        check("Glossary modal works", g_ok)

        # ---- 11. Web Safe Mode ----
        safe_ok = page.evaluate("""() => {
            var scripts = document.querySelectorAll('script[src]');
            for (var s of scripts) {
                try {
                    var url = new URL(s.src);
                    if (url.origin === location.origin) continue;
                } catch (e) {}
                if (s.src.includes('localhost') || s.src.includes('127.0.0.1')) return false;
            }
            return true;
        }""")
        check("Safe Mode: no localhost/127.0.0.1 in scripts", safe_ok)

        # ---- 12. Console errors (filtered) ----
        # Benign patterns we ignore
        benign_patterns = [
            "favicon.ico",
            "Third-party cookie",
        ]
        real_errors = [e for e in console_errors if not any(b in e for b in benign_patterns)]
        check("Console: no P0 JS errors", len(real_errors) == 0,
              f"{len(real_errors)} filtered from {len(console_errors)} total: {real_errors[:5]}")

        # ---- 13. Network 404 ----
        real_404s = [u for u in network_404s if "favicon" not in u.lower()]
        check("Network: no core resource 404s", len(real_404s) == 0,
              f"{len(real_404s)} 404s: {real_404s[:5]}")

        # ---- 14. Network 405 & Translate API requests ----
        translate_requests = [u for u in requested_urls if "/api/i18n/translate" in u]
        check("Network: no /api/i18n/translate requests", len(translate_requests) == 0,
              f"calls={len(translate_requests)}")
        check("Network: no 405 status responses", len(network_405s) == 0,
              f"{len(network_405s)} 405s: {network_405s[:5]}")

        # ---- 15. Cache Busting checks ----
        has_version_param = True
        missing_versions = []
        for file in ["version.js", "app.js", "content-i18n.js"]:
            matching = [u for u in requested_urls if file in u and "v=v2026.6.11-r13.10" in u]
            if not matching:
                has_version_param = False
                missing_versions.append(file)
        check("Cache Busting: core scripts have version query param", has_version_param,
              f"missing={missing_versions}")

        sql_en_versioned = any("sql_en.js" in u and "v=v2026.6.11-r13.10" in u for u in requested_urls)
        check("Cache Busting: sql_en.js loaded with version param", sql_en_versioned)

        python_fr_versioned = any("python_fr.js" in u and "v=v2026.6.11-r13.10" in u for u in requested_urls)
        check("Cache Busting: python_fr.js loaded with version param", python_fr_versioned)

        browser.close()

    # ---- Summary ----
    print("")
    print("=" * 60)
    fails = [r for r in results if r[1] == "FAIL"]
    total = len(results)
    passed = total - len(fails)
    print(f"  Result: {passed}/{total} passed, {len(fails)} failed")
    print(f"  Console errors (total logged): {len(console_errors)}")
    print(f"  Network 404s (total): {len(network_404s)}")

    if fails:
        print("")
        for name, _, det in fails:
            print(f"  FAIL  {name}: {det}")
        print("")
        print("=" * 60)
        print("  Conclusion: FAIL")
        print("=" * 60)
        print("")
        return False
    else:
        print("")
        print("=" * 60)
        print("  Conclusion: ALL PASS")
        print("=" * 60)
        print("")
        return True


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
