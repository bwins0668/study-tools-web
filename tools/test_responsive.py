"""
tools/test_responsive.py
========================
Playwright-based responsive layout test.
Runs against the already-running dev server at http://127.0.0.1:5173.
Tests multiple viewport sizes, checks visibility of key elements,
SQL execution, and console errors.

Usage:
    python tools/test_responsive.py

Requires:
    playwright installed (pip install playwright && playwright install chromium)
    npm run dev running on http://127.0.0.1:5173
"""

import sys, json, time, os
import io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright


VIEWPORTS = [
    {"name": "1920x1080 (Desktop)", "width": 1920, "height": 1080},
    {"name": "1366x768 (Laptop)", "width": 1366, "height": 768},
    {"name": "1024x768 (Tablet Landscape)", "width": 1024, "height": 768},
    {"name": "820x1180 (iPad Pro Portrait)", "width": 820, "height": 1180},
    {"name": "768x1024 (iPad Portrait)", "width": 768, "height": 1024},
    {"name": "390x844 (iPhone 14)", "width": 390, "height": 844},
    {"name": "375x667 (iPhone SE)", "width": 375, "height": 667},
]

BASE_URL = "http://127.0.0.1:5174"

TEST_SQL = "SELECT * FROM students_mst LIMIT 3;"


def get_viewport_category(width):
    if width > 1200: return "desktop"
    if width > 768: return "tablet"
    return "mobile"


def test_viewport(page, vp):
    """Run all checks for a single viewport size."""
    width = vp["width"]
    height = vp["height"]
    name = vp["name"]

    page.set_viewport_size({"width": width, "height": height})

    # Navigate
    page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
    # Allow async SQLiteAdapter init
    page.wait_for_timeout(2000)

    results = {
        "viewport": name,
        "width": width,
        "height": height,
        "category": get_viewport_category(width),
        "horizontal_scroll": False,
        "sql_button_visible": False,
        "sql_execution_ok": False,
        "nav_tabs_visible": False,
        "sidebar_visible": False,
        "content_readable": False,
        "engine_type": "",
        "heartbeat_405": False,
        "api_events_405": False,
        "console_errors": [],
        "notes": [],
    }

    # --- Console error collection ---
    console_errors = []
    def on_console(msg):
        text = msg.text
        if msg.type == "error":
            console_errors.append(text)
            if "/heartbeat" in text:
                results["heartbeat_405"] = True
            if "/api/learning/events" in text or "/api/ai" in text or "legacy import" in text:
                results["api_events_405"] = True
    page.on("console", on_console)

    # Refresh to pick up console listener
    page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
    page.wait_for_timeout(2000)

    # --- 1. Horizontal scroll check ---
    scroll_w = page.evaluate("document.documentElement.scrollWidth")
    viewport_w = page.evaluate("window.innerWidth")
    if scroll_w > viewport_w + 5:  # 5px tolerance
        results["horizontal_scroll"] = True
        results["notes"].append(f"Horizontal overflow: {scroll_w}px > {viewport_w}px")

    # --- 2. SQL button visibility ---
    btn = page.query_selector(".run-query-btn")
    if btn:
        is_visible = btn.is_visible()
        results["sql_button_visible"] = is_visible
        if is_visible:
            text = btn.text_content()
            results["notes"].append(f"SQL button text: '{text}'")
        else:
            # get bounding box for debug
            box = btn.bounding_box()
            results["notes"].append(f"SQL button exists but not visible, box: {box}")
    else:
        results["notes"].append("❌ SQL button NOT FOUND in DOM")

    # --- 3. SQL execution ---
    try:
        # Type SQL and run
        editor = page.query_selector("#sql-editor")
        if editor:
            editor.click()
            editor.fill("")
            editor.type(TEST_SQL, delay=10)
            if btn and btn.is_visible():
                btn.click()
            else:
                # Try via JavaScript if button not clickable
                page.evaluate("runPlaygroundQuery()")
            page.wait_for_timeout(1000)
            # Check output
            output_body = page.query_selector("#output-body")
            if output_body:
                output_text = output_body.inner_text()
                if "student_id" in output_text and "student_name" in output_text:
                    results["sql_execution_ok"] = True
                    results["notes"].append("SQL executed: result table visible")
                elif "エラー" in output_text or "error" in output_text.lower():
                    results["notes"].append("SQL executed but error: " + output_text[:100])
                else:
                    results["notes"].append("SQL executed, output empty/unexpected")
        else:
            results["notes"].append("SQL editor NOT FOUND")
    except Exception as e:
        results["notes"].append(f"SQL execution error: {str(e)}")

    # --- 4. Engine type ---
    engine_type = page.evaluate("typeof window.getCurrentSqlEngineType === 'function' ? window.getCurrentSqlEngineType() : 'N/A'")
    results["engine_type"] = engine_type

    # --- 5. Navigation tabs ---
    tab = page.query_selector("#subject-tab-sql")
    if tab and tab.is_visible():
        results["nav_tabs_visible"] = True
    else:
        results["notes"].append("SQL tab not visible (may be scrolled)")

    # --- 6. Sidebar ---
    sidebar = page.query_selector(".app-sidebar")
    if sidebar:
        nav = page.query_selector("#lessons-nav")
        if nav:
            has_items = len(nav.query_selector_all(".lesson-nav-item")) > 0
            results["sidebar_visible"] = has_items
            if not has_items:
                results["notes"].append("Sidebar exists but no lesson items visible")
        else:
            results["notes"].append("Sidebar exists but lessons-nav not found")

    # --- 7. Content readability ---
    content = page.query_selector(".lesson-content")
    if content:
        h2 = page.query_selector("#lesson-title-ja")
        if h2 and h2.is_visible():
            results["content_readable"] = True
        else:
            results["notes"].append("Lesson content container exists but title not visible")

    # Collect relevant console errors
    relevant_errors = [
        e for e in console_errors
        if "405" in e or "heartbeat" in e or "Failed to load" in e or "503" in e
    ]
    results["console_errors"] = relevant_errors[:5]

    page.close()
    return results


def main():
    print("=" * 70)
    print("  Responsive Layout Test — Playwright Headless Chromium")
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
            print(f"  ▶ Testing: {vp['name']} ({vp['width']}×{vp['height']})")
            print(f"  {'─' * 66}")

            try:
                page = context.new_page()
                result = test_viewport(page, vp)
                all_results.append(result)
                page.close()
            except Exception as e:
                print(f"  ❌ ERROR: {str(e)[:100]}")
                all_results.append({
                    "viewport": vp["name"],
                    "width": vp["width"],
                    "height": vp["height"],
                    "category": get_viewport_category(vp["width"]),
                    "error": str(e),
                })
                continue

            # Print results
            ok = "✅" if not result.get("error") else "❌"

            scroll_ok = "✅" if not result["horizontal_scroll"] else "❌"
            btn_ok = "✅" if result["sql_button_visible"] else "❌"
            sql_ok = "✅" if result["sql_execution_ok"] else "❌"
            engine_ok = "✅" if "SQLiteAdapter" in result["engine_type"] else "❌"
            heart_ok = "✅" if not result["heartbeat_405"] else "❌"
            api_ok = "✅" if not result["api_events_405"] else "❌"

            print(f"    Scroll:   {scroll_ok}  Button:  {btn_ok}  SQL:   {sql_ok}")
            print(f"    Engine:   {engine_ok} ({result['engine_type']})  Nav: {result['nav_tabs_visible']}  Sidebar: {result['sidebar_visible']}")
            print(f"    Heart:    {heart_ok}  API:  {api_ok}")

            # Count pass/fail of critical checks
            for check, val in [
                ("scroll", not result["horizontal_scroll"]),
                ("sql_button", result["sql_button_visible"]),
                ("sql_exec", result["sql_execution_ok"]),
                ("engine", "SQLiteAdapter" in result["engine_type"]),
                ("heartbeat_405", not result["heartbeat_405"]),
                ("api_405", not result["api_events_405"]),
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
    print(f"  Critical checks:  {passed_checks}/{total_checks} passed ({passed_checks*100//max(total_checks,1)}%)")

    # Overall verdict
    blocking_issues = []
    for r in all_results:
        if r.get("error"):
            blocking_issues.append(f"  ❌ {r['viewport']}: ERROR - {r['error'][:80]}")
        if r.get("horizontal_scroll"):
            blocking_issues.append(f"  ❌ {r['viewport']}: horizontal scroll")
        if not r.get("sql_button_visible"):
            blocking_issues.append(f"  ❌ {r['viewport']}: SQL button hidden")
        if not r.get("sql_execution_ok") and not r.get("error"):
            blocking_issues.append(f"  ❌ {r['viewport']}: SQL execution failed")
        if r.get("heartbeat_405"):
            blocking_issues.append(f"  ❌ {r['viewport']}: /heartbeat 405 persists")
        if r.get("api_events_405"):
            blocking_issues.append(f"  ❌ {r['viewport']}: /api/learning/events 405 persists")

    if blocking_issues:
        print(f"\n  BLOCKING ISSUES ({len(blocking_issues)}):")
        for issue in blocking_issues:
            print(issue)
    else:
        print(f"\n  ✅ No blocking issues found across all viewports!")

    print()

    # Write JSON report
    report_path = "tools/responsive_test_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"  Full report saved to: {report_path}")
    print()

    return len(blocking_issues) == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
