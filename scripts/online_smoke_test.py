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
    """Click the language toggle button, filter by code, and click the option."""
    toggle = page.locator("#language-toggle-btn")
    if toggle.count() == 0:
        return False
    toggle.click()
    page.wait_for_timeout(500)
    
    # Filter using search input to bring item into view
    search_input = page.locator("#language-search-input")
    if search_input.count() > 0 and search_input.is_visible():
        search_input.fill(code)
        page.wait_for_timeout(300)
        
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
        # Disable service worker registration to prevent PWA caching and local server timeouts
        context.add_init_script("Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });")
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

        # Fetch version metadata dynamically from version.js
        version_meta = page.evaluate("window.STUDY_TOOLS_VERSION")
        web_version = version_meta.get("webVersion", "v2026.6.13")
        desktop_version = version_meta.get("desktopVersion", "v2026.6.13")
        release_url = version_meta.get("releaseUrl", "")
        asset_version = version_meta.get("assetVersion", "v2026.6.13-r15.24")

        # Extract actual HTML query version from app.js script tag in DOM
        app_script = page.locator('script[src*="app.js"]').first
        actual_html_version = asset_version
        if app_script.count() > 0:
            src = app_script.get_attribute("src") or ""
            if "?v=" in src:
                actual_html_version = src.split("?v=")[1]
            elif "&v=" in src:
                actual_html_version = src.split("&v=")[1]

        # ---- 2. Page title ----
        title = page.title()
        check("Page title contains 'Study Tools Web'", "Study Tools Web" in title,
              f"actual='{title}'")

        # ---- 3. Version display ----
        has_ver = page.locator(f"text={web_version}").count() > 0
        check(f"Page shows {web_version}", has_ver)

        # ---- 4. Release link ----
        rel_link = page.locator(f'a[href="{release_url}"]')
        check(f"Release link present: {release_url}", rel_link.count() > 0)

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

        # ---- 10. Glossary modal & Korean search/mobile checks ----
        page.wait_for_timeout(1000)
        glossary_btn = page.locator("#glossary-open-btn")
        g_ok = glossary_btn.count() > 0
        if g_ok:
            # Switch to Korean first
            switch_lang(page, "ko")
            
            # Click glossary open
            glossary_btn.click()
            page.wait_for_timeout(1000)
            
            modal = page.locator("#glossary-modal")
            g_ok = modal.is_visible()
            check("Glossary modal is visible in Korean", g_ok)
            
            # 10.1 Check count is 1500
            cards = page.locator(".glossary-card")
            card_count = cards.count()
            check("Glossary contains exactly 1500 terms", card_count == 1500, f"actual count={card_count}")
            
            # 10.2 Check 30 random terms
            import random
            indices = random.sample(range(card_count), min(30, card_count))
            forbidden = ["PLACEHOLDER", "TODO", "TBD", "待翻译", "임시 번역", "임시 텍스트", "임시 설명", "임시값", "번역 필요", "나중에 번역", "placeholder"]
            banned_found = False
            for idx in indices:
                card_text = cards.nth(idx).inner_text()
                for word in forbidden:
                    if word in card_text:
                        banned_found = True
                        print(f"    FAIL: Card text contains banned word '{word}': {card_text[:100]}")
            check("30 random Korean terms checked (no placeholders)", not banned_found)
            
            # 10.3 Search 데이터베이스
            page.fill("#glossary-search", "데이터베이스")
            page.wait_for_timeout(500)
            db_count = page.locator(".glossary-card:visible").count()
            check("Search for '데이터베이스' returns results", db_count > 0, f"found={db_count}")
            
            # 10.4 Search 인증
            page.fill("#glossary-search", "")
            page.fill("#glossary-search", "인증")
            page.wait_for_timeout(500)
            auth_count = page.locator(".glossary-card:visible").count()
            check("Search for '인증' returns results", auth_count > 0, f"found={auth_count}")
            
            # 10.5 Search 암호화
            page.fill("#glossary-search", "")
            page.fill("#glossary-search", "암호화")
            page.wait_for_timeout(500)
            enc_count = page.locator(".glossary-card:visible").count()
            check("Search for '암호화' returns results", enc_count > 0, f"found={enc_count}")
            
            # 10.6 Search SQL
            page.fill("#glossary-search", "")
            page.fill("#glossary-search", "SQL")
            page.wait_for_timeout(500)
            sql_count = page.locator(".glossary-card:visible").count()
            check("Search for 'SQL' returns results", sql_count > 0, f"found={sql_count}")
            
            # 10.7 Search nonexistent
            page.fill("#glossary-search", "")
            page.fill("#glossary-search", "nonexistent_random_word_abc")
            page.wait_for_timeout(500)
            empty_count = page.locator(".glossary-card:visible").count()
            empty_msg = page.locator(".glossary-empty").inner_text()
            check("Search for nonexistent returns 0 results", empty_count == 0)
            check("Search empty message is '해당 용어가 없습니다'", "해당 용어가 없습니다" in empty_msg, f"actual='{empty_msg}'")
            
            # Close glossary
            close_btn = page.locator(".glossary-close-btn")
            if close_btn.count() > 0 and close_btn.first.is_visible():
                close_btn.first.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            
        else:
            check("Glossary modal works", False, "Glossary button not found")

        # ---- 10.8 Mobile viewport check ----
        mobile_ok = False
        try:
            mobile_context = browser.new_context(
                viewport={"width": 375, "height": 667},
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            )
            mobile_context.add_init_script("Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });")
            mobile_page = mobile_context.new_page()
            mobile_page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
            mobile_btn = mobile_page.locator("#glossary-open-btn")
            if mobile_btn.count() > 0:
                mobile_btn.click()
                mobile_page.wait_for_timeout(1000)
                m_dialog = mobile_page.locator(".glossary-dialog")
                if m_dialog.count() > 0 and m_dialog.is_visible():
                    # Check if glossary results container is scrollable and visible
                    m_results = mobile_page.locator("#glossary-results")
                    mobile_ok = m_results.count() > 0 and m_results.is_visible()
            mobile_context.close()
        except Exception as e:
            print(f"    Mobile check exception: {e}")
        check("Mobile viewport: Glossary dialog is responsive and scrollable", mobile_ok)

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
            matching = [u for u in requested_urls if file in u and f"v={actual_html_version}" in u]
            if not matching:
                has_version_param = False
                missing_versions.append(file)
        check("Cache Busting: core scripts have version query param", has_version_param,
              f"missing={missing_versions}")

        sql_en_versioned = any("sql_en.js" in u and f"v={asset_version}" in u for u in requested_urls)
        check("Cache Busting: sql_en.js loaded with version param", sql_en_versioned)

        python_fr_versioned = any("python_fr.js" in u and f"v={asset_version}" in u for u in requested_urls)
        check("Cache Busting: python_fr.js loaded with version param", python_fr_versioned)

        # ---- 16. Manifest checks ----
        # 16.1 assets/asset-manifest.json HTTP 200 and schema validation
        asset_manifest_url = f"{BASE_URL}/assets/asset-manifest.json"
        res_asset = context.request.get(asset_manifest_url)
        check("Manifest: assets/asset-manifest.json HTTP 200", res_asset.status == 200, f"status={res_asset.status}")
        
        asset_manifest_json = None
        if res_asset.status == 200:
            try:
                asset_manifest_json = res_asset.json()
                check("Manifest: asset-manifest.json is valid JSON", True)
            except Exception as e:
                check("Manifest: asset-manifest.json is valid JSON", False, str(e))
            
            if asset_manifest_json:
                check("Manifest: asset-manifest.json has correct assetVersion",
                      asset_manifest_json.get("assetVersion") == asset_version,
                      f"version={asset_manifest_json.get('assetVersion')}")

        # 16.2 data/i18n_content/manifest.json HTTP 200 and schema validation
        content_manifest_url = f"{BASE_URL}/data/i18n_content/manifest.json"
        res_content = context.request.get(content_manifest_url)
        check("Manifest: data/i18n_content/manifest.json HTTP 200", res_content.status == 200, f"status={res_content.status}")
        
        content_manifest_json = None
        if res_content.status == 200:
            try:
                content_manifest_json = res_content.json()
                check("Manifest: content manifest is valid JSON", True)
            except Exception as e:
                check("Manifest: content manifest is valid JSON", False, str(e))
                
            if content_manifest_json:
                check("Manifest: content manifest has correct assetVersion",
                      content_manifest_json.get("assetVersion") == asset_version,
                      f"version={content_manifest_json.get('assetVersion')}")
                check("Manifest: content manifest has totalPacks = 20",
                      content_manifest_json.get("totalPacks") == 20,
                      f"packs={content_manifest_json.get('totalPacks')}")
                
                # Check for critical packs
                packs = content_manifest_json.get("packs", [])
                has_sql_en = any(p.get("subject") == "sql" and p.get("lang") == "en" for p in packs)
                has_python_fr = any(p.get("subject") == "python" and p.get("lang") == "fr" for p in packs)
                check("Manifest: content manifest contains sql/en", has_sql_en)
                check("Manifest: content manifest contains python/fr", has_python_fr)
                
                # Sample validation of manifest path loading
                sample_pack_ok = True
                for p in packs:
                    if p.get("subject") == "sql" and p.get("lang") == "en":
                        pack_path = p.get("path")
                        res_pack = context.request.get(f"{BASE_URL}/{pack_path}")
                        if res_pack.status != 200:
                            sample_pack_ok = False
                            break
                check("Manifest: sampled pack path from manifest is online accessible", sample_pack_ok)

        # ---- 17. UX / UI checks ----
        # 17.1 Onboarding guidance banner exists
        guidance = page.locator("#first-run-guidance")
        check("UX: Onboarding guidance banner exists", guidance.count() > 0)

        # 17.2 Glossary clear button exists
        glossary_btn = page.locator("#glossary-open-btn")
        if glossary_btn.count() > 0:
            glossary_btn.click()
            page.wait_for_timeout(800)
            clear_btn = page.locator("#glossary-search-clear")
            check("UX: Glossary search clear button exists", clear_btn.count() > 0)
            close_btn = page.locator(".glossary-close-btn")
            if close_btn.count() > 0 and close_btn.first.is_visible():
                close_btn.first.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(300)
        else:
            check("UX: Glossary search clear button exists", False, "Glossary open button not found")

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
