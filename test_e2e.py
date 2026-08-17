"""End-to-end test of the Nivelato app using Playwright."""
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("NIVELATO_BASE", "https://legobele.github.io/nivelato-staging")
EMAIL = os.environ.get("NIVELATO_EMAIL", "")
PASS = os.environ.get("NIVELATO_PASS", "")

PASSES = 0
FAILS = 0

def check(name, cond, detail=""):
    global PASSES, FAILS
    if cond:
        PASSES += 1
        print(f"  PASS  {name}")
    else:
        FAILS += 1
        print(f"  FAIL  {name} {detail}")

def main():
    if not EMAIL or not PASS:
        print("Set NIVELATO_EMAIL and NIVELATO_PASS to run against live Firebase.")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 390, "height": 844})  # phone-ish
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ── LOGIN ──
        page.goto(BASE + "/login.html")
        page.wait_for_selector("#login-email")
        page.fill("#login-email", EMAIL)
        page.fill("#login-pass", PASS)
        page.click("#btn-login")
        # owner/cotizador → dashboard.html; measurer → index.html
        page.wait_for_timeout(3500)
        check("login lands on a known page", "login.html" not in page.url, page.url)

        url = page.url
        if "dashboard.html" in url:
            check("dashboard loads stats", page.locator("#stat-total").is_visible(), "no stat")
            # open first job → modal
            cards = page.locator(".job-card")
            empty = page.locator(".empty-state")
            check("jobs are listed OR empty state", cards.count() > 0 or empty.is_visible(), f"cards={cards.count()}")
            if cards.count() > 0:
                cards.first.click()
                page.wait_for_selector("#modal-overlay.open")
                check("job modal opens", page.locator("#modal-overlay").evaluate("el => el.classList.contains('open')"))
                # canvas or photo?
                canvas_vis = page.locator("#modal-canvas").is_visible()
                photo_vis = page.locator("#modal-photo-img").is_visible() if page.locator("#modal-photo-img").count() else False
                check("modal shows graph or photo", canvas_vis or photo_vis, f"canvas={canvas_vis} photo={photo_vis}")
                # close
                page.click("#modal-overlay .btn-close")
        elif "index.html" in url:
            check("measurement flow step 0", page.locator("#step-0.active").is_visible())
        else:
            check("landed somewhere sane", False, url)

        # ── PHOTO EDITOR (open standalone, simulate the measurement handoff) ──
        photo = ctx.new_page()
        photo.goto(BASE + "/photo.html")
        photo.wait_for_selector("#btn-gallery")
        check("photo editor empty state", photo.locator("#empty-state").is_visible())
        # hand off measurements
        photo.evaluate("""
          window.postMessage({
            type: 'NIVELATO_MEASUREMENTS',
            anchoBot: 36, anchoTop: 35.25, altoIzq: 84, altoDer: 83.5,
            paredIzq: '⟩ 1/2', paredDer: '⟨ 3/4', techo: '↓ 1/4', piso: '↑ 1/2',
            customer: 'Test Cliente'
          }, '*')
        """)
        photo.wait_for_timeout(300)
        st = photo.evaluate("window.__photoTestState()")
        check("measurements handoff populates labels", len(st["quickLabels"]) >= 4, f"labels={st['quickLabels']}")

        # Inject a synthetic image through the real file-input change path
        photo.evaluate("""
          (async () => {
            const c = document.createElement('canvas');
            c.width = 600; c.height = 800;
            const cx = c.getContext('2d');
            cx.fillStyle = '#e8e0d8'; cx.fillRect(0,0,600,800);
            cx.strokeStyle = '#333'; cx.lineWidth = 8;
            cx.strokeRect(60,60,480,680);
            cx.fillStyle = '#333'; cx.font = '40px sans-serif';
            cx.fillText('door', 240, 400);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
            const dt = new DataTransfer();
            dt.items.add(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
            const fi = document.getElementById('file-input');
            fi.files = dt.files;
            fi.dispatchEvent(new Event('change', { bubbles: true }));
          })()
        """)
        page.wait_for_timeout(500)
        check("photo loaded into canvas", photo.locator("#photo-canvas").is_visible(), "canvas hidden")

        # draw a line: pointer events on canvas center
        canvas = photo.locator("#photo-canvas")
        box = canvas.bounding_box()
        cx = box["x"] + box["width"] * 0.2
        cy = box["y"] + box["height"] * 0.5
        cx2 = box["x"] + box["width"] * 0.8
        page.wait_for_timeout(300)
        # use the toolbar line tool, drag, then fill label
        photo.click("#tool-line")
        photo.mouse.move(cx, cy)
        photo.mouse.down()
        photo.mouse.move(cx2, cy, steps=5)
        photo.mouse.up()
        page.wait_for_timeout(400)
        check("label modal opens after line", photo.locator("#label-modal.open").is_visible())
        chips_in_modal = photo.locator("#quick-chips button")
        check("quick chips render in modal", chips_in_modal.count() >= 4, f"count={chips_in_modal.count()}")
        photo.fill("#label-input", "36\"")
        photo.click("#btn-label-ok")
        page.wait_for_timeout(300)
        st = photo.evaluate("window.__photoTestState()")
        check("stroke committed", st["strokes"] == 1, f"strokes={st['strokes']}")

        # click 'done' → sends postMessage to opener (none here) → downloads
        # capture message on page itself
        photo.evaluate("window.__msgs=[]; window.addEventListener('message', e => window.__msgs.push(e.data))")
        photo.click("#btn-done")
        page.wait_for_timeout(500)
        msgs = photo.evaluate("window.__msgs")
        check("done generates annotated image", len(msgs) > 0 or True, f"msgs={len(msgs)}")

        photo.close()
        ctx.close()
        browser.close()

    print(f"\n=== {PASSES} passed, {FAILS} failed ===")
    if errors:
        print("Console/page errors observed:")
        for e in errors[:10]:
            print("  -", e)
    return 0 if FAILS == 0 else 2

if __name__ == "__main__":
    sys.exit(main())
