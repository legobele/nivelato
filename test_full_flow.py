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

        # ── STEP 6: Foto con medidas (optional) — open in-app iframe editor ──
        check("foto step has Omitir", page.locator("#step-6 button:has-text('Omitir')").is_visible())

        # open editor (iframe modal, not a popup)
        page.click("#btn-open-photo")
        page.wait_for_selector("#photo-editor-overlay", state="visible", timeout=5000)
        check("photo editor overlay opened", True)
        frame_el = page.locator("#photo-editor-frame")
        frame_el.wait_for()
        # get the actual Frame object (for evaluate/wait)
        def get_frame():
            for f in page.frames:
                if f.url and "photo.html" in f.url:
                    return f
            return None
        frame = None
        for _ in range(20):
            frame = get_frame()
            if frame: break
            page.wait_for_timeout(300)
        assert frame is not None, "photo.html iframe never appeared"
        frame.wait_for_selector("#btn-gallery", timeout=10000)
        check("photo editor iframe loaded", True)

        # measurements handoff should have happened automatically
        frame.wait_for_timeout(600)
        st = frame.evaluate("window.__photoTestState ? window.__photoTestState() : null")
        check("editor received measurements", st and st["measurements"] and st["measurements"]["anchoBot"] > 0, str(st))

        # upload the actual glass door photo (gallery input)
        frame.locator("#file-input-gallery").set_input_files(PHOTO_PATH)
        frame.wait_for_timeout(800)
        check("photo loaded into editor canvas", frame.locator("#photo-canvas").is_visible())

        # frame should appear automatically
        frame.wait_for_timeout(400)
        st2 = frame.evaluate("window.__photoTestState()")
        check("frame auto-placed", st2["hasFrame"] and st2["corners"] is not None, str(st2))

        # drag the TL corner outward to simulate alignment
        canvas = frame.locator("#photo-canvas")
        box = canvas.bounding_box()
        tl = st2["corners"]["TL"]
        imgScale = box["width"] / st2["baseW"]
        sx = box["x"] + tl["x"] * imgScale
        sy = box["y"] + tl["y"] * imgScale
        page.mouse.move(sx, sy)
        page.mouse.down()
        # loupe should appear while dragging
        frame.wait_for_timeout(150)
        loupe_vis = frame.locator("#loupe-canvas").is_visible()
        check("loupe appears during drag", loupe_vis)
        page.mouse.move(sx - 20, sy - 20, steps=5)
        page.mouse.up()
        frame.wait_for_timeout(400)
        # loupe should hide after drag
        check("loupe hides after drag", not frame.locator("#loupe-canvas").is_visible())
        st3 = frame.evaluate("window.__photoTestState()")
        moved = (st3["corners"]["TL"]["x"] < st2["corners"]["TL"]["x"] and st3["corners"]["TL"]["y"] < st2["corners"]["TL"]["y"])
        check("corner drag moves frame", moved, str(st2["corners"]) + " -> " + str(st3["corners"]))

        # draw a custom line with the line tool
        frame.locator("#tool-line").click()
        cb = canvas.bounding_box()
        lx1 = cb["x"] + cb["width"] * 0.3
        ly1 = cb["y"] + cb["height"] * 0.3
        lx2 = cb["x"] + cb["width"] * 0.6
        ly2 = cb["y"] + cb["height"] * 0.3
        page.mouse.move(lx1, ly1)
        page.mouse.down()
        page.mouse.move(lx2, ly2, steps=5)
        page.mouse.up()
        frame.wait_for_selector("#label-modal.open", timeout=5000)
        check("label modal opens for custom line", True)
        frame.locator("#label-input").fill("Ancho extra")
        frame.locator("#btn-label-ok").click()
        frame.wait_for_timeout(300)
        st4 = frame.evaluate("window.__photoTestState()")
        check("custom line committed", st4["customStrokes"] == 1, str(st4))

        # hit "Usar esta foto" → sends postMessage to parent → closes overlay
        frame.locator("#btn-done").click()
        # wait for the parent to receive the message and close the overlay
        page.wait_for_timeout(1500)
        # overlay should close (iframe editor done)
        check("overlay closes after done", not page.locator("#photo-editor-overlay").is_visible())
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
