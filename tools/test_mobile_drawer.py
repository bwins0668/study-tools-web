"""
tools/test_mobile_drawer.py
============================
Test mobile sidebar drawer functionality across viewports.
"""
import json, sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5174"
TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"

VIEWPORTS = [
    {"name": "1920x1080 (Desktop)", "width": 1920, "height": 1080},
    {"name": "1366x768 (Laptop)", "width": 1366, "height": 768},
    {"name": "1024x768 (Tablet Landscape)", "width": 1024, "height": 768},
    {"name": "820x1180 (iPad Pro Portrait)", "width": 820, "height": 1180},
    {"name": "768x1024 (iPad Portrait)", "width": 768, "height": 1024},
    {"name": "390x844 (iPhone 14)", "width": 390, "height": 844},
    {"name": "375x667 (iPhone SE)", "width": 375, "height": 667},
]

def test_viewport(page, vp):
    width = vp["width"]
    height = vp["height"]
    name = vp["name"]

    page.set_viewport_size({"width": width, "height": height})
    page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(2000)

    results = {
        "viewport": name,
        "width": width,
        "height": height,
        "overflow": False,
        "toggle_visible": False,
        "toggle_aria_expanded": None,
        "drawer_open_default": False,
        "drawer_opens": False,
        "drawer_closes": False,
        "esc_closes": False,
        "nav_click_closes": False,
        "resize_closes": False,
        "sidebar_position": None,
        "sql_button_visible": False,
        "sql_execution_ok": False,
        "engine_type": "",
        "notes": [],
    }

    # Console error collection
    errors = []
    def on_console(msg):
        if msg.type == "error":
            errors.append(msg.text)
    page.on("console", on_console)

    # Refresh to pick up console listener
    page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(2000)

    # 1. Check horizontal scroll
    sw = page.evaluate("document.documentElement.scrollWidth")
    cw = page.evaluate("document.documentElement.clientWidth")
    if sw > cw + 5:
        results["overflow"] = True
        results["notes"].append(f"Horizontal scroll: {sw}px > {cw}px")

    # 2. Check toggle button
    toggle = page.query_selector("#mobile-sidebar-toggle")
    if toggle:
        results["toggle_visible"] = toggle.is_visible()
        results["toggle_aria_expanded"] = toggle.get_attribute("aria-expanded")
    else:
        results["notes"].append("Toggle button NOT found")

    # 3. Check sidebar default state
    sidebar_style = page.evaluate("""() => {
        const s = document.querySelector('.app-sidebar');
        if (!s) return null;
        const cs = window.getComputedStyle(s);
        return {
            position: cs.position,
            transform: cs.transform,
            width: cs.width,
            left: cs.left,
            zIndex: cs.zIndex
        };
    }""")
    results["sidebar_position"] = sidebar_style
    if sidebar_style:
        results["drawer_open_default"] = "translateX(0)" in sidebar_style["transform"]

    # 4. SQL button and execution
    btn = page.query_selector(".run-query-btn")
    results["sql_button_visible"] = btn.is_visible() if btn else False

    editor = page.query_selector("#sql-editor")
    if editor and btn:
        editor.click()
        editor.fill("")
        editor.type(TEST_SQL, delay=5)
        btn.click()
        page.wait_for_timeout(1000)
        output_body = page.query_selector("#output-body")
        if output_body:
            text = output_body.inner_text()
            results["sql_execution_ok"] = "student_id" in text and "student_name" in text

    results["engine_type"] = page.evaluate(
        "typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'"
    )

    # 5. Mobile-only tests (768px and below)
    if width <= 768:
        # Test drawer opens
        if toggle and results["toggle_visible"]:
            toggle.click()
            page.wait_for_timeout(400)

            open_style = page.evaluate("""() => {
                const s = document.querySelector('.app-sidebar');
                if (!s) return null;
                return window.getComputedStyle(s).transform;
            }""")
            results["drawer_opens"] = "translateX(0)" in (open_style or "")

            # Test backdrop visible
            backdrop = page.query_selector("#mobile-sidebar-backdrop")
            if backdrop:
                results["notes"].append(f"Backdrop visible: {backdrop.is_visible()}")

            # Test backdrop closes drawer
            if backdrop and backdrop.is_visible():
                page.evaluate("document.getElementById('mobile-sidebar-backdrop').click()")
                page.wait_for_timeout(400)

            closed_style = page.evaluate("""() => {
                const s = document.querySelector('.app-sidebar');
                if (!s) return null;
                return window.getComputedStyle(s).transform;
            }""")
            results["drawer_closes"] = "translateX(-100%)" in (closed_style or "")

            # Reopen for ESC test
            toggle.click()
            page.wait_for_timeout(400)

            # Test ESC closes
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

            esc_style = page.evaluate("""() => {
                const s = document.querySelector('.app-sidebar');
                if (!s) return null;
                return window.getComputedStyle(s).transform;
            }""")
            results["esc_closes"] = "translateX(-100%)" in (esc_style or "")

            # Reopen for nav-click test
            toggle.click()
            page.wait_for_timeout(400)

            # Test clicking a lesson nav item closes drawer
            lessons_nav = page.query_selector("#lessons-nav")
            if lessons_nav:
                first_item = lessons_nav.query_selector(".lesson-nav-item")
                if first_item:
                    first_item.click()
                    page.wait_for_timeout(400)
                    nav_closed_style = page.evaluate("""() => {
                        const s = document.querySelector('.app-sidebar');
                        if (!s) return null;
                        return window.getComputedStyle(s).transform;
                    }""")
                    results["nav_click_closes"] = "translateX(-100%)" in (nav_closed_style or "")
                else:
                    results["notes"].append("No lesson nav items found")

            # Test resize closes drawer
            toggle.click()
            page.wait_for_timeout(400)
            page.set_viewport_size({"width": 800, "height": height})
            page.wait_for_timeout(400)
            resize_style = page.evaluate("""() => {
                const s = document.querySelector('.app-sidebar');
                if (!s) return null;
                return window.getComputedStyle(s).transform;
            }""")
            results["resize_closes"] = "translateX(-100%)" in (resize_style or "")
            page.set_viewport_size({"width": width, "height": height})

    return results

def main():
    print("=" * 70)
    print("  Mobile Sidebar Drawer Test")
    print("=" * 70)
    print(f"  Base URL: {BASE_URL}")
    print(f"  Viewports: {len(VIEWPORTS)}")
    print()

    all_results = []
    passed_checks = 0
    total_checks = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            ignore_https_errors=True,
        )

        for vp in VIEWPORTS:
            print(f"  {'─' * 66}")
            print(f"  Testing: {vp['name']} ({vp['width']}x{vp['height']})")
            print(f"  {'─' * 66}")

            try:
                page = context.new_page()
                result = test_viewport(page, vp)
                all_results.append(result)
                page.close()
            except Exception as e:
                print(f"  ERROR: {str(e)[:100]}")
                all_results.append({
                    "viewport": vp["name"],
                    "width": vp["width"],
                    "height": vp["height"],
                    "error": str(e),
                })
                continue

            # Print results
            ok = "NO" if result.get("error") else "OK"

            overflow_ok = "✅" if not result["overflow"] else "❌"
            toggle_ok = "✅" if result["width"] > 768 else ("✅" if result["toggle_visible"] else "❌")
            drawer_open_default_ok = "✅" if not result["drawer_open_default"] else "❌"
            drawer_ok = "✅" if result["width"] > 768 or result["drawer_opens"] else "n/a"
            sql_ok = "✅" if result["sql_button_visible"] and result["sql_execution_ok"] else "❌"

            print(f"    Scroll: {overflow_ok}  Toggle: {toggle_ok}  Drawer: {drawer_open_default_ok}/{drawer_ok}")
            print(f"    Opens: {'✅' if result['drawer_opens'] else 'n/a'}  Closes: {'✅' if result['drawer_closes'] else 'n/a'}")
            print(f"    ESC: {'✅' if result['esc_closes'] else 'n/a'}  NavClick: {'✅' if result['nav_click_closes'] else 'n/a'}  Resize: {'✅' if result['resize_closes'] else 'n/a'}")
            print(f"    SQL: {sql_ok} ({result['engine_type']})")

            # Count checks
            for check, val in [
                ("overflow", not result["overflow"]),
                ("toggle_mobile", result["width"] <= 768 or not result["toggle_visible"]),
                ("drawer_closed_default", not result["drawer_open_default"]),
                ("drawer_opens", result["width"] > 768 or result["drawer_opens"]),
                ("drawer_closes", result["width"] > 768 or result["drawer_closes"]),
                ("esc_closes", result["width"] > 768 or result["esc_closes"]),
                ("nav_click_closes", result["width"] > 768 or result["nav_click_closes"]),
                ("resize_closes", result["width"] > 768 or result["resize_closes"]),
                ("sql_button", result["sql_button_visible"]),
                ("sql_exec", result["sql_execution_ok"]),
                ("engine", "SQLiteAdapter" in result["engine_type"]),
            ]:
                total_checks += 1
                if val:
                    passed_checks += 1

            for note in result["notes"]:
                print(f"    {note}")

            print()

        browser.close()

    # Summary
    print(f"  {'=' * 66}")
    print(f"  SUMMARY")
    print(f"  {'=' * 66}")
    print(f"  Viewports tested: {len(all_results)}")
    print(f"  Checks: {passed_checks}/{total_checks} passed ({passed_checks*100//max(total_checks,1)}%)")

    # Check for blocking issues
    blocking = []
    for r in all_results:
        if r.get("error"):
            blocking.append(f"  {r['viewport']}: {r['error'][:60]}")
        if r.get("overflow"):
            blocking.append(f"  {r['viewport']}: horizontal overflow")
        if not r["sql_button_visible"]:
            blocking.append(f"  {r['viewport']}: SQL button hidden")
        if not r["sql_execution_ok"]:
            blocking.append(f"  {r['viewport']}: SQL execution failed")
        if "SQLiteAdapter" not in r["engine_type"]:
            blocking.append(f"  {r['viewport']}: wrong engine: {r['engine_type']}")
        if r["width"] <= 768:
            if not r["toggle_visible"]:
                blocking.append(f"  {r['viewport']}: toggle not visible")
            if not r["drawer_opens"]:
                blocking.append(f"  {r['viewport']}: drawer doesn't open")
            if not r["drawer_closes"]:
                blocking.append(f"  {r['viewport']}: drawer doesn't close")
            if not r["esc_closes"]:
                blocking.append(f"  {r['viewport']}: ESC doesn't close drawer")
            if not r["nav_click_closes"]:
                blocking.append(f"  {r['viewport']}: nav click doesn't close drawer")

    if blocking:
        print(f"\n  BLOCKING ISSUES ({len(blocking)}):")
        for issue in blocking:
            print(issue)
    else:
        print(f"\n  ✅ All checks passed!")

    print()

    # Write report
    report_path = "tools/mobile_drawer_test_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"  Report saved to: {report_path}")

    return len(blocking) == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)