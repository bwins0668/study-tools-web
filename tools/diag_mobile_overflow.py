"""
tools/diag_mobile_overflow.py
==============================
Diagnose specific elements causing horizontal overflow on mobile.
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
    (430, 932, "iPhone 15 Pro Max"),
]

def main():
    print("=" * 60)
    print("  Mobile Overflow Diagnosis")
    print("=" * 60)
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for width, height, label in VIEWPORTS:
            print(f"  [{label} {width}x{height}]")
            print(f"  {'-' * 56}")

            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
            page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(2000)

            # 1. Overall overflow
            sw = page.evaluate("document.documentElement.scrollWidth")
            cw = page.evaluate("document.documentElement.clientWidth")
            iw = page.evaluate("window.innerWidth")
            print(f"    scrollWidth={sw} clientWidth={cw} innerWidth={iw}")
            if sw > cw + 3:
                print(f"    ❌ OVERFLOW: {sw} > {cw} (diff {sw-cw}px)")

                # 2. Find specific overflowing elements
                overflowers = page.evaluate("""() => {
                    const results = [];
                    const all = document.querySelectorAll('*');
                    for (const el of all) {
                        if (el === document.documentElement || el === document.body) continue;
                        const rect = el.getBoundingClientRect();
                        const parentRect = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
                        // Check if element extends beyond viewport right edge
                        if (rect.right > window.innerWidth + 1) {
                            const cs = window.getComputedStyle(el);
                            results.push({
                                tag: el.tagName,
                                id: el.id || '',
                                className: (el.className || '').substring(0, 60),
                                rectRight: Math.round(rect.right),
                                rectWidth: Math.round(rect.width),
                                parentWidth: parentRect ? Math.round(parentRect.width) : 0,
                                overflow: cs.overflow,
                                whiteSpace: cs.whiteSpace,
                                flex: cs.flex,
                                display: cs.display,
                                text: (el.innerText || '').substring(0, 40).replace(/\\n/g, ' ')
                            });
                        }
                    }
                    // Sort by how far they overflow
                    results.sort((a, b) => b.rectRight - a.rectRight);
                    return results.slice(0, 15);
                }""")

                if overflowers:
                    print(f"\n    Top overflowing elements:")
                    for i, el in enumerate(overflowers):
                        print(f"    {i+1}. <{el['tag']}> #{el['id']} .{el['className'][:40]}")
                        print(f"       rectRight={el['rectRight']} width={el['rectWidth']} parentW={el['parentWidth']}")
                        print(f"       white-space={el['whiteSpace']} display={el['display']}")
                        if el['text']:
                            print(f"       text=\"{el['text']}\"")
                        print()
            else:
                print(f"    ✅ No overflow (sw={sw}, cw={cw})")

            page.close()

            print()

        browser.close()

    print("  Done.")


if __name__ == "__main__":
    main()
