"""Full end-to-end: measurement flow (steps 0-7) -> photo annotation -> save -> dashboard."""
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("NIVELATO_BASE", "https://legobele.github.io/nivelato-staging")
EMAIL = os.environ.get("NIVELATO_EMAIL", "")
PASS = os.environ.get("NIVELATO_PASS", "")
PHOTO_PATH = os.environ.get("NIVELATO_PHOTO", "")

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
        print("Set NIVELATO_EMAIL and NIVELATO_PASS")
        return 1
    if not PHOTO_PATH or not os.path.exists(PHOTO_PATH):
        print("Set NIVELATO_PHOTO to the glass door image path")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ── LOGIN (owner/cotizador → dashboard; measurer → index) ──
        page.goto(BASE + "/login.html")
        page.wait_for_selector("#login-email")
        page.fill("#login-email", EMAIL)
        page.fill("#login-pass", PASS)
        page.click("#btn-login")
        page.wait_for_timeout(4000)
        # if redirected to dashboard, go to index.html directly (owner can measure too)
        if "dashboard.html" in page.url:
            page.goto(BASE + "/index.html")
            page.wait_for_timeout(3000)
        check("on measurement flow (index.html)", "index.html" in page.url, page.url)
        check("step 0 active", page.locator("#step-0.active").is_visible())

        # ── STEP 0: Cliente / Proyecto / Ubicación ──
        page.fill("#customer-name", "Puerta Danny")
        page.fill("#project-name", "Quality Glazing")
        page.fill("#location-name", "Oficina Central")
        page.click("#step-0 .btn-primary")
        page.wait_for_timeout(400)
        check("step 1 active after next", page.locator("#step-1.active").is_visible())

        # ── STEP 1: Hueco — ancho abajo 38 1/4", alto izquierda 94 1/2" ──
        page.fill("#hueco-ancho-bot-whole", "38")
        page.select_option("#hueco-ancho-bot-frac", "0.25")
        page.fill("#hueco-alto-izq-whole", "94")
        page.select_option("#hueco-alto-izq-frac", "0.5")
        page.click("#step-1 .btn-primary")
        page.wait_for_timeout(400)
        check("step 2 active", page.locator("#step-2.active").is_visible())

        # ── STEP 2: Pared izquierda — A abajo / B arriba ──
        page.fill("#pI-a-whole", "1")
        page.fill("#pI-b-whole", "1")
        page.click("#step-2 .btn-primary")
        page.wait_for_timeout(400)
        check("step 3 active", page.locator("#step-3.active").is_visible())

        # ── STEP 3: Pared derecha ──
        page.fill("#pD-a-whole", "1")
        page.fill("#pD-b-whole", "1")
        page.click("#step-3 .btn-primary")
        page.wait_for_timeout(400)
        check("step 4 active", page.locator("#step-4.active").is_visible())

        # ── STEP 4: Arriba — A izq / B der ──
        page.fill("#t-a-whole", "1")
        page.fill("#t-b-whole", "1")
        page.click("#step-4 .btn-primary")
        page.wait_for_timeout(400)
        check("step 5 active", page.locator("#step-5.active").is_visible())

        # ── STEP 5: Abajo ──
        page.fill("#p-a-whole", "1")
        page.fill("#p-b-whole", "1")
        page.click("#step-5 .btn-primary")
        page.wait_for_timeout(400)
        check("step 6 (foto) active", page.locator("#step-6.active").is_visible())

        # ── STEP 6: Foto con medidas (optional) — open editor, upload, align frame ──
        check("foto step has Omitir", page.locator("#step-6 button:has-text('Omitir')").is_visible())

        # open editor popup
        with ctx.expect_page() as popup_info:
            page.click("#btn-open-photo")
        popup = popup_info.value
        popup.wait_for_load_state()
        popup.wait_for_selector("#btn-gallery", timeout=10000)
        check("photo editor popup opened", True)

        # measurements handoff should have happened automatically (opener.postMessage)
        popup.wait_for_timeout(600)
        st = popup.evaluate("window.__photoTestState ? window.__photoTestState() : null")
        check("editor received measurements", st and st["measurements"] and st["measurements"]["anchoBot"] > 0, str(st))

        # upload the actual glass door photo
        popup.set_input_files("#file-input", PHOTO_PATH)
        popup.wait_for_timeout(800)
        check("photo loaded into editor canvas", popup.locator("#photo-canvas").is_visible())

        # frame should appear automatically (auto-placed, handles visible)
        popup.wait_for_timeout(400)
        st2 = popup.evaluate("window.__photoTestState()")
        check("frame auto-placed", st2["hasFrame"] and st2["corners"] is not None, str(st2))

        # drag the TL corner outward a bit to simulate alignment
        canvas = popup.locator("#photo-canvas")
        box = canvas.bounding_box()
        tl = st2["corners"]["TL"]
        # convert image coords → screen: screen = rect.x + imgX/scale
        imgScale = box["width"] / st2["baseW"]
        sx = box["x"] + tl["x"] * imgScale
        sy = box["y"] + tl["y"] * imgScale
        popup.mouse.move(sx, sy)
        popup.mouse.down()
        popup.mouse.move(sx - 20, sy - 20, steps=5)
        popup.mouse.up()
        popup.wait_for_timeout(400)
        st3 = popup.evaluate("window.__photoTestState()")
        moved = (st3["corners"]["TL"]["x"] < st2["corners"]["TL"]["x"] and st3["corners"]["TL"]["y"] < st2["corners"]["TL"]["y"])
        check("corner drag moves frame", moved, str(st2["corners"]) + " -> " + str(st3["corners"]))

        # hit "Usar esta foto" → sends postMessage to opener → closes popup
        popup.click("#btn-done")
        # wait for opener to receive the message (async postMessage + handler)
        page.wait_for_timeout(1500)
        # annotatedPhotoDataUrl is module-scoped in adhd.js; read the preview img src instead
        prev_img_src = page.evaluate("document.getElementById('photo-preview-img') ? document.getElementById('photo-preview-img').src : null") if page.locator("#photo-preview-img").count() else None
        check("opener received annotated photo", prev_img_src is not None and prev_img_src.startswith("data:image"), str(prev_img_src)[:60])

        # preview should show on step 6
        prev = page.locator("#photo-preview")
        check("photo preview visible on step 6", prev.is_visible())
        check("preview img has data url", page.locator("#photo-preview-img").get_attribute("src", timeout=2000).startswith("data:image"))

        # ── STEP 7: Resumen — click the actual "Siguiente" (in .btn-row, not #btn-open-photo) ──
        page.click("#step-6 .btn-row .btn-primary")
        page.wait_for_timeout(500)
        check("step 7 (resumen) active", page.locator("#step-7.active").is_visible())
        area = page.locator("#res-area").inner_text()
        check("summary shows hueco", "38" in area, area)

        # ── SAVE: Compartir → saves to Firestore ──
        # step 7 .btn-row .btn-primary = "Compartir"
        page.click("#step-7 .btn-row .btn-primary")
        page.wait_for_timeout(3000)
        # success overlay "☁️ Guardado en la nube" or #save-status appears
        overlay = page.evaluate("""Array.from(document.querySelectorAll('div')).some(d => d.textContent.includes('Guardado en la nube') && d.getBoundingClientRect().width > 0)""")
        save_status = page.locator("#save-status").is_visible()
        check("save triggered and status shown", overlay or save_status, f"overlay={overlay} save_status={save_status}")

        # navigate to dashboard and verify the job appears with the photo
        page.goto(BASE + "/dashboard.html")
        page.wait_for_timeout(4000)
        check("dashboard loads", page.locator("#stat-total").is_visible())
        # find our test job card
        cards = page.locator(".job-card")
        check("dashboard has job cards", cards.count() > 0, f"count={cards.count()}")

        if cards.count() > 0:
            first = cards.first
            title = first.inner_text()
            check("newest job is Puerta Danny", "Danny" in title or "Quality" in title, title)
            first.click()
            page.wait_for_selector("#modal-overlay.open")
            check("job modal opens", True)
            # photo should be shown instead of graph
            photo_img = page.locator("#modal-photo-img")
            canvas_vis = page.locator("#modal-canvas").is_visible()
            # wait for the img to actually load (network fetch)
            photo_vis = False
            if photo_img.count():
                try:
                    page.wait_for_function(
                        "document.getElementById('modal-photo-img') && document.getElementById('modal-photo-img').naturalWidth > 0",
                        timeout=8000)
                    photo_vis = photo_img.is_visible()
                except Exception:
                    photo_vis = False
            check("modal shows annotated photo", photo_vis, f"canvas={canvas_vis} photo={photo_vis}")
            if photo_vis:
                src = photo_img.get_attribute("src")
                check("photo is data URL or storage URL", src.startswith("data:image") or "firebasestorage" in src or "storage" in src, src[:80])
            # check hueco details in modal
            body = page.locator("#modal-body").inner_text()
            check("modal shows cliente", "Puerta Danny" in body, body[:100])
            check("modal shows hueco 38", "38" in body)
            page.click("#modal-overlay .btn-close")
        else:
            # maybe the account is a measurer with viewOwn only; check empty state
            check("dashboard empty state (no jobs for this user)", page.locator(".empty-state").is_visible())

        browser.close()

    print(f"\n=== {PASSES} passed, {FAILS} failed ===")
    if errors:
        print("Console/page errors:")
        for e in errors[:10]:
            print("  -", e)
    return 0 if FAILS == 0 else 2

if __name__ == "__main__":
    sys.exit(main())
