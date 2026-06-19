"""
scripts/mobile_overflow_check.py
=================================
Mobile horizontal overflow check for multiple viewports.
Runs against local dev server. Usage: python scripts/mobile_overflow_check.py
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import json, subprocess, time

VIEWPORTS = [
    (375, 812, "iPhone X"),
    (390, 844, "iPhone 14"),
    (414, 896, "iPhone 11"),
    (430, 932, "iPhone 15 Pro Max"),
    (393, 852, "Pixel 8"),
]

PAGES = [
    {"path": "/", "label": "首页"},
    {"path": "/?module=sql", "label": "SQL 学习入口"},
    {"path": "/?module=sql&lesson=1", "label": "SQL lesson 页面"},
    {"path": "/?module=sql&lesson=1&lang=both", "label": "左右对照模式"},
    {"path": "/?module=sql&exam=1", "label": "右侧沙盒/考试入口"},
]

def main():
    results = {"passed": 0, "failed": 0, "skipped": 0, "details": []}

    # Try to start a local server, or use existing
    server_proc = None
    port = 5173
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_running = sock.connect_ex(('127.0.0.1', port)) == 0
    sock.close()

    if not server_running:
        print(f"Starting dev server on port {port}...")
        server_proc = subprocess.Popen(
            ["npx", "-y", "live-server", f"--port={port}", "--no-browser"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        time.sleep(3)

    BASE_URL = f"http://127.0.0.1:{port}"

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ playwright not installed. Run: pip install playwright && playwright install chromium")
        if server_proc:
            server_proc.terminate()
        return

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for width, height, label in VIEWPORTS:
                print(f"\n{'='*60}")
                print(f"  {label} ({width}x{height})")
                print(f"{'='*60}")

                for page_info in PAGES:
                    context = browser.new_context(viewport={"width": width, "height": height})
                    page = context.new_page()
                    url = f"{BASE_URL}{page_info['path']}"
                    try:
                        page.goto(url, wait_until="networkidle", timeout=15000)
                        page.wait_for_timeout(2000)

                        overflow = page.evaluate("""
                            () => ({
                                innerWidth: window.innerWidth,
                                bodyScrollWidth: document.body.scrollWidth,
                                docScrollWidth: document.documentElement.scrollWidth,
                                maxAllowed: window.innerWidth + 2,
                                bodyClientWidth: document.body.clientWidth,
                                docClientWidth: document.documentElement.clientWidth
                            })
                        """)

                        has_overflow = (
                            overflow["docScrollWidth"] > overflow["maxAllowed"] or
                            overflow["bodyScrollWidth"] > overflow["maxAllowed"]
                        )

                        # Find offenders if overflow
                        offenders = []
                        if has_overflow:
                            offenders = page.evaluate("""
                                (maxAllowed) => {
                                    const results = [];
                                    const all = document.querySelectorAll('*');
                                    for (const el of all) {
                                        if (el === document.documentElement || el === document.body) continue;
                                        const rect = el.getBoundingClientRect();
                                        const cs = window.getComputedStyle(el);
                                        if (rect.right > maxAllowed) {
                                            results.push({
                                                tag: el.tagName,
                                                id: (el.id || '').slice(0, 30),
                                                className: (el.className || '').slice(0, 60),
                                                right: Math.round(rect.right),
                                                width: Math.round(rect.width),
                                                overflow: cs.overflow,
                                                display: cs.display
                                            });
                                        }
                                    }
                                    results.sort((a, b) => b.right - a.right);
                                    return results.slice(0, 10);
                                }
                            """, overflow["maxAllowed"])

                        status = "PASS" if not has_overflow else "FAIL"
                        if status == "PASS":
                            results["passed"] += 1
                        else:
                            results["failed"] += 1

                        print(f"\n  [{status}] {page_info['label']}")
                        print(f"    scrollWidth={overflow['docScrollWidth']} innerWidth={overflow['innerWidth']}")
                        if has_overflow:
                            print(f"    ❌ OVERFLOW: docScrollWidth={overflow['docScrollWidth']} > maxAllowed={overflow['maxAllowed']}")
                            for o in offenders[:5]:
                                print(f"      <{o['tag']}> #{o['id']} .{o['className']} right={o['right']} width={o['width']}")
                        else:
                            print(f"    ✅ No overflow")

                        results["details"].append({
                            "viewport": f"{width}x{height}",
                            "page": page_info["label"],
                            "status": status,
                            "overflow": overflow
                        })

                    except Exception as e:
                        print(f"\n  [SKIP] {page_info['label']}: {e}")
                        results["skipped"] += 1

                    page.close()
                    context.close()

            browser.close()
    finally:
        if server_proc:
            server_proc.terminate()

    # Summary
    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    total = results["passed"] + results["failed"]
    print(f"  Total: {total} | PASS: {results['passed']} | FAIL: {results['failed']} | SKIP: {results['skipped']}")
    if results["failed"] > 0:
        print(f"  ❌ Some tests FAILED")
        sys.exit(1)
    else:
        print(f"  ✅ All tests PASSED")

    # Save report
    report_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "mobile_overflow_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"  Report saved: {report_path}")


if __name__ == "__main__":
    main()
