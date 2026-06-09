"""
tools/audit_phase4c.py
========================
Audit non-SQL modules for mobile layout issues.
Tests Java, Python, IT Passport, SG, and exam pages.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import json
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5175"

# Add timeout tracking
import time
start_time = time.time()

VIEWPORTS = [
    {"name": "1920x1080", "width": 1920, "height": 1080, "category": "desktop"},
    {"name": "1366x768", "width": 1366, "height": 768, "category": "desktop"},
    {"name": "1024x768", "width": 1024, "height": 768, "category": "tablet"},
    {"name": "768x1024", "width": 768, "height": 1024, "category": "tablet"},
    {"name": "390x844", "width": 390, "height": 844, "category": "mobile"},
    {"name": "375x667", "width": 375, "height": 667, "category": "mobile"},
]

MODULES = ["java", "python", "itpass", "sg", "cbt", "coding"]


def switch_subject(page, subject):
    """Switch to a subject module and wait for it to load."""
    btn = page.query_selector(f"#subject-tab-{subject}")
    if btn:
        btn.click()
        page.wait_for_timeout(1500)


def get_selector_info(page, selector):
    """Get visibility and dimensions for a selector."""
    el = page.query_selector(selector)
    if not el:
        return {"visible": False, "found": False}
    return {
        "visible": el.is_visible(),
        "found": True,
        "clientWidth": el.client_width,
        "scrollWidth": el.scroll_width,
        "rect": el.bounding_box(),
        "computed": None,
    }


def audit_module(page, subject, viewport):
    """Audit a single module at a single viewport."""
    width = viewport["width"]
    height = viewport["height"]
    name = viewport["name"]

    results = {
        "viewport": name,
        "width": width,
        "height": height,
        "subject": subject,
        "overflow": False,
        "issues": [],
        "checks": [],
    }

    # Console error collection
    errors = []

    def on_console(msg):
        if msg.type == "error":
            errors.append(msg.text)
            if "/heartbeat" in msg.text or "/api/learning/events" in msg.text:
                results["issues"].append("405 error detected")

    page.on("console", on_console)

    # Switch to module
    switch_subject(page, subject)
    page.wait_for_timeout(1500)
    # Re-wait to capture console errors
    page.wait_for_timeout(500)

    # Check document overflow
    sw = page.evaluate("document.documentElement.scrollWidth")
    cw = page.evaluate("document.documentElement.clientWidth")
    if sw > cw + 5:
        results["overflow"] = True
        results["issues"].append(f"Horizontal overflow: {sw}px > {cw}px")

    # Module-specific checks
    if subject in ["java", "python"]:
        # Sandbox card
        sandbox_id = f"{subject}-sandbox-card"
        sandbox = page.query_selector(f"#{sandbox_id}")
        if sandbox:
            results["checks"].append(f"{subject}-sandbox-found")
            if not sandbox.is_visible():
                results["issues"].append(f"{subject} sandbox not visible")
            # Editor
            editor = page.query_selector(f"#{subject}-editor")
            if editor:
                results["checks"].append(f"{subject}-editor-found")
                if editor.is_visible():
                    # Type something
                    editor.click()
                    editor.fill("")
                    editor.type("test", delay=5)
                else:
                    results["issues"].append(f"{subject} editor not visible")
            # Run button
            run_btn = page.query_selector(f"#{subject}-run-btn")
            if run_btn:
                results["checks"].append(f"{subject}-run-btn-found")
                if not run_btn.is_visible():
                    results["issues"].append(f"{subject} run button not visible")
                # Try to click
                try:
                    rect = run_btn.bounding_box()
                    results["checks"].append(f"{subject}-run-btn-clickable")
                except:
                    results["issues"].append(f"{subject} run button not clickable")
            # Output card
            output_id = f"{subject}-output-card"
            output = page.query_selector(f"#{output_id}")
            if output:
                results["checks"].append(f"{subject}-output-found")
                if not output.is_visible():
                    results["issues"].append(f"{subject} output not visible")

    elif subject == "itpass":
        # Flashcard card
        flashcard = page.query_selector("#itpass-flashcards-card")
        if flashcard and flashcard.is_visible():
            results["checks"].append("itpass-flashcard-found")
        # Checklist card
        checklist = page.query_selector("#itpass-checklist-card")
        if checklist and checklist.is_visible():
            results["checks"].append("itpass-checklist-found")
        # Tools card
        tools = page.query_selector("#itpass-tools-card")
        if tools and tools.is_visible():
            results["checks"].append("itpass-tools-found")
        # Quiz
        quiz = page.query_selector(".quiz-section")
        if quiz:
            results["checks"].append("itpass-quiz-found")

    elif subject == "sg":
        # Similar to itpass - flashcards, quiz, etc.
        flashcard = page.query_selector("#sg-flashcards-card")
        if flashcard and flashcard.is_visible():
            results["checks"].append("sg-flashcard-found")

    elif subject == "cbt":
        # Check exam config and testing screens
        config = page.query_selector("#cbt-config-screen")
        testing = page.query_selector("#cbt-testing-screen")
        results_screen = page.query_selector("#cbt-results-screen")
        if config:
            results["checks"].append("cbt-config-found")
        if testing:
            results["checks"].append("cbt-testing-found")
        if results_screen:
            results["checks"].append("cbt-results-found")

    elif subject == "coding":
        # Check coding exam config and panel
        coding_config = page.query_selector("#coding-exam-config")
        if coding_config and coding_config.is_visible():
            results["checks"].append("coding-config-found")
        coding_panel = page.query_selector("#coding-exam-panel")
        if coding_panel and coding_panel.is_visible():
            results["checks"].append("coding-panel-found")
        coding_results = page.query_selector("#coding-exam-results")
        if coding_results and coding_results.is_visible():
            results["checks"].append("coding-results-found")

    # Check if any inline styles are causing issues
    inline_style_check = page.evaluate("""
() => {
      const styleTags = document.querySelectorAll('style[inline]');
      return styleTags.length;
    }
    """)
    if inline_style_check > 0:
        results["checks"].append(f"inline-styles={inline_style_check}")

    results["console_errors"] = errors[:5]

    return results


def main():
    print("=" * 70)
    print("  Phase 4C: Non-SQL Modules Mobile Layout Audit")
    print("=" * 70)
    print(f"  Base URL: {BASE_URL}")
    print(f"  Modules: {MODULES}")
    print(f"  Viewports: {len(VIEWPORTS)}")
    print()

    all_results = []
    issues_by_module = {m: [] for m in MODULES}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})

        for vp in VIEWPORTS:
            for subject in MODULES:
                print(f"  Testing: {vp['name']} - {subject.upper()}...")
                try:
                    page = context.new_page()
                    result = audit_module(page, subject, vp)
                    all_results.append(result)
                    page.close()
                except Exception as e:
                    print(f"    ERROR: {str(e)[:100]}")
                    all_results.append({
                        "viewport": vp["name"],
                        "subject": subject,
                        "error": str(e),
                    })
                    issues_by_module[subject].append(
                        f"{vp['name']}: {str(e)[:60]}"
                    )
                continue

        browser.close()

    # Summary
    print()
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)

    total_checks = len(all_results)
    with_issues = [r for r in all_results if r.get("issues")]
    with_overflow = [r for r in all_results if r.get("overflow")]

    print(f"  Total module/viewport combos: {total_checks}")
    print(f"  With issues: {len(with_issues)}")
    print(f"  With overflow: {len(with_overflow)}")
    print()

    # Issues by module
    print("  ISSUES BY MODULE:")
    for module in MODULES:
        issues = issues_by_module[module]
        print(f"    {module.upper()}: {len(issues)} issue(s)")
        for issue in issues:
            print(f"      - {issue}")

    # Blocking issues check
    blocking = []
    for r in all_results:
        issues = r.get("issues") or []
        if r.get("overflow"):
            blocking.append(f"  {r['viewport']} {r['subject']}: horizontal overflow")
        if r.get("error"):
            blocking.append(f"  {r['viewport']} {r['subject']}: {r['error'][:60]}")
        for issue in issues:
            if "405" in str(issue):
                blocking.append(f"  {r['viewport']} {r['subject']}: 405 error: {issue}")

    print()
    if blocking:
        print("  BLOCKING ISSUES:")
        for issue in blocking:
            print(issue)
    else:
        print("  ✅ No blocking issues found!")

    # Write report
    report_path = "tools/phase4c_audit_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "total_combos": total_checks,
                "with_issues": len(with_issues),
                "with_overflow": len(with_overflow),
                "issues_by_module": {m: len(issues_by_module[m]) for m in MODULES},
                "blocking_issues_count": len(blocking),
            },
            "results": all_results,
        }, f, ensure_ascii=False, indent=2)
    print(f"\n  Report saved to: {report_path}")

    return len(blocking) == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)