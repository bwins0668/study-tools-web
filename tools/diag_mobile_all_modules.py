"""
tools/diag_mobile_all_modules.py
=================================
Test all modules across mobile viewports for overflow.
"""
import sys, os, io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5173"
VIEWPORTS = [
    (390, 844, "iPhone 14"),
    (375, 667, "iPhone SE"),
    (430, 932, "iPhone 15 PM"),
]
MODULES = ["sql", "java", "python", "itpass", "sg"]

def main():
    print("=" * 60)
    print("  Module-by-Module Mobile Overflow Check")
    print("=" * 60)
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for width, height, vp_label in VIEWPORTS:
            print(f"  [{vp_label} {width}x{height}]")
            print(f"  {'─' * 56}")
            context = browser.new_context(viewport={"width": width, "height": height})

            for module in MODULES:
                page = context.new_page()
                page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(1000)

                # Switch to module
                btn = page.query_selector(f"#subject-tab-{module}")
                if btn:
                    btn.click()
                    page.wait_for_timeout(2000)

                sw = page.evaluate("document.documentElement.scrollWidth")
                cw = page.evaluate("document.documentElement.clientWidth")
                diff = sw - cw

                # Find overflowers
                overflowers = page.evaluate("""() => {
                    const results = [];
                    const all = document.querySelectorAll('body *');
                    for (const el of all) {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > window.innerWidth + 2 && rect.width > 10) {
                            const cs = window.getComputedStyle(el);
                            const text = (el.innerText || '').trim().substring(0, 50).replace(/\\n/g, ' ');
                            results.push({
                                tag: el.tagName,
                                id: el.id || '',
                                cls: (el.className || '').substring(0, 50),
                                right: Math.round(rect.right),
                                width: Math.round(rect.width),
                                ws: cs.whiteSpace,
                                overflow: cs.overflow,
                                text
                            });
                        }
                    }
                    results.sort((a, b) => b.right - a.right);
                    return results.slice(0, 10);
                }""")

                status = f"overflow={diff}px" if diff > 3 else "OK"
                icon = "❌" if diff > 3 else "✅"
                print(f"    {icon} {module.upper():8s}  sw={sw} cw={cw}  {status}")
                for o in overflowers:
                    print(f"        <{o['tag']}> #{o['id']} .{o['cls'][:30]}  right={o['right']} w={o['width']}")
                    if o['text']:
                        print(f"          \"{o['text']}\"")
                page.close()

            context.close()
            print()

        browser.close()
    print("  Done.")


if __name__ == "__main__":
    main()
