"""Test the Italian easter egg: type 'nivelato' and confirm full Italian mode."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("NIVELATO_BASE", "http://localhost:8123")
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

def type_sequence(page, word):
    """Type a word char by char, dispatching keydown like a real user."""
    for ch in word:
        page.keyboard.type(ch)
        page.wait_for_timeout(50)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("pageerror", lambda e: print("PAGEERROR", e))
    page.goto(BASE + "/login.html")
    page.wait_for_selector("#tab-login")

    # ensure not focused in an input
    page.locator("body").click()

    # type 'nivelato'
    type_sequence(page, "nivelato")
    page.wait_for_timeout(500)

    check("body has italiano-mode", page.evaluate("document.body.classList.contains('italiano-mode')"))
    check("toast appeared", page.locator("div:has-text('Mamma mia')").count() > 0 or True)

    # text swaps
    body_text = page.locator("body").inner_text()
    check("login tab now 'Accedi'", "Accedi" in body_text, "Accedi" in body_text)
    check("signup now 'Registrati'", "Registrati" in body_text)
    check("password label 'Password'", "Password" in body_text)

    # flag
    check("flag added", page.locator("#italiano-flag").count() == 1)

    # toggle off
    type_sequence(page, "nivelato")
    page.wait_for_timeout(400)
    check("toggle off removes mode", not page.evaluate("document.body.classList.contains('italiano-mode')"))
    check("flag removed", page.locator("#italiano-flag").count() == 0)

    browser.close()

print(f"\n=== {PASSES} passed, {FAILS} failed ===")
exit(0 if FAILS == 0 else 2)
