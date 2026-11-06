// nivelato-support.js — support.nivelatolabs.com
// Canonical home of the Nivelato help center (Centro de ayuda), moved
// here 2026-10-12 from legobele.github.io/nivelato/ayuda.html (ayuda.html
// in the repo is now a redirect stub to this host; the stub goes live
// whenever the repo's wedged Pages pipeline next succeeds).
// Serves the help page from GitHub raw (repo legobele/nivelato, dir
// support/), same freshness pattern as nivelato-beta: raw tracks main
// within seconds, and response headers are rebuilt from scratch so
// raw's text/plain + sandbox CSP never reach the browser.
// The page's relative assets (niv-dark.css, company-theme.js,
// press-yaoi.js, icon-192.png, manifest.json, privacy.html) live at the
// repo root and are proxied from there, like the beta worker does.
// /dev is the landing for the app's dev-environment interstitial
// ("See support.nivelatolabs.com/dev for info and guidance"). It carries
// real guidance (m29): what the dev flag means, that it is an alarm
// state, and the exit (Ctrl+Alt+B toggles the mark off on the Nivelato
// page that shows the red screen).
// Service-worker format (modules format 400s on raw API upload).
var RAW = "https://raw.githubusercontent.com/legobele/nivelato/main";
var DIR = "support";
var ROUTES = {"/": "/index.html", "/ayuda.html": "/index.html"};

var DEV_HTML =
  '<!DOCTYPE html>\n'
  + '<html lang="en">\n'
  + '<head>\n'
  + '<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<title>Dev environment - Nivelato Support</title>\n'
  + '<meta name="description" content="What the red DEV ENVIRONMENT DETECTED screen means, why you should stop working while the dev flag is on, and how to turn it off with Ctrl+Alt+B.">\n'
  + '<link rel="canonical" href="https://support.nivelatolabs.com/dev">\n'
  + '<meta name="robots" content="noindex, nofollow">\n'
  + '<meta name="theme-color" content="#0e0e10">\n'
  + '<style>\n'
  + ':root{\n'
  + '  --brand:#1971c2;\n'
  + '  --bg:#0e0e10;\n'
  + '  --card:#17171a;\n'
  + '  --text:#f5f5f7;\n'
  + '  --muted:#a7a7ad;\n'
  + '  --border:rgba(255,255,255,0.14);\n'
  + '  --radius:18px;\n'
  + '  --alarm:#c81e1e;\n'
  + '}\n'
  + '*{box-sizing:border-box;margin:0;padding:0}\n'
  + 'body{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:0 0 60px}\n'
  + 'header{position:relative;background:var(--brand);color:#fff;padding:40px 20px 32px;text-align:center}\n'
  + 'header h1{font-size:28px;margin-bottom:6px}\n'
  + 'header p{opacity:.88;font-size:15px;max-width:560px;margin:0 auto}\n'
  + 'main{max-width:720px;margin:0 auto;padding:24px 16px 0}\n'
  + 'a{color:#4dabf7}\n'
  + 'header a{color:#fff}\n'
  + '.crumb{margin-bottom:16px;font-size:13.5px}\n'
  + '.crumb a{color:var(--muted);text-decoration:none}\n'
  + '.crumb a:hover{color:var(--text);text-decoration:underline}\n'
  + '.toc{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}\n'
  + '.toc a{background:var(--card);border:1px solid var(--border);border-radius:999px;padding:8px 14px;font-size:13px;text-decoration:none;color:var(--text)}\n'
  + '.toc a:hover{border-color:var(--brand)}\n'
  + 'section{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}\n'
  + 'section h2{font-size:19px;margin-bottom:10px}\n'
  + 'section p,section li{font-size:14.5px}\n'
  + 'section p{margin-bottom:10px}\n'
  + 'section p:last-child{margin-bottom:0}\n'
  + 'section ul,section ol{padding-left:22px;margin:8px 0}\n'
  + 'section li{margin-bottom:6px}\n'
  + 'section.alert{background:var(--alarm);border:none;color:#fff}\n'
  + 'section.alert h1{font-size:24px;letter-spacing:.02em;margin-bottom:10px;line-height:1.25}\n'
  + 'section.alert p{color:#fff;font-size:15px;margin-bottom:0}\n'
  + 'kbd{background:#2a2a30;border:1px solid rgba(255,255,255,0.25);border-bottom-width:2px;border-radius:6px;padding:1px 7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;white-space:nowrap}\n'
  + 'section.alert kbd{background:rgba(0,0,0,0.25)}\n'
  + '.step-flow{counter-reset:step;list-style:none;padding:0}\n'
  + '.step-flow li{counter-increment:step;padding:10px 0 10px 44px;position:relative;border-bottom:1px solid var(--border);font-size:14px}\n'
  + '.step-flow li:last-child{border-bottom:none}\n'
  + '.step-flow li::before{content:counter(step);position:absolute;left:0;top:10px;width:30px;height:30px;border-radius:50%;background:var(--brand);color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}\n'
  + '.step-flow li b{display:block;font-size:14.5px}\n'
  + '.note{font-size:13.5px;color:var(--muted);margin-top:12px}\n'
  + '.faq details{border-bottom:1px solid var(--border);padding:12px 0}\n'
  + '.faq details:last-child{border-bottom:none}\n'
  + '.faq summary{font-weight:600;font-size:14.5px;cursor:pointer}\n'
  + '.faq summary::-webkit-details-marker{color:var(--brand)}\n'
  + '.faq .a{font-size:14px;color:var(--muted);margin-top:6px;padding-right:8px}\n'
  + 'footer{text-align:center;color:var(--muted);font-size:13px;margin-top:28px;padding:0 20px}\n'
  + '.lang-toggle{position:fixed;top:14px;right:14px;z-index:10;background:rgba(14,14,16,0.35);border:1px solid rgba(255,255,255,0.5);border-radius:999px;color:#fff;font-family:ui-monospace,monospace;font-size:.78rem;letter-spacing:.08em;padding:7px 14px;cursor:pointer}\n'
  + '.lang-toggle:hover{border-color:#fff}\n'
  + ':focus-visible{outline:2px solid #4dabf7;outline-offset:2px}\n'
  + '@media (max-width:560px){header h1{font-size:24px}section.alert h1{font-size:20px}section{padding:16px}}\n'
  + '</style>\n'
  + '</head>\n'
  + '<body>\n'
  + '<button class="lang-toggle" aria-label="Switch language / Cambiar idioma">ES</button>\n'
  + '<header>\n'
  + '  <h1 data-i18n="header.h1">Nivelato Support</h1>\n'
  + '  <p data-i18n="header.sub">Dev environment warning: what it means and how to turn it off</p>\n'
  + '</header>\n'
  + '<main>\n'
  + '  <p class="crumb"><a href="/" data-i18n="nav.back">Back to the help center</a></p>\n'
  + '\n'
  + '  <section class="alert" aria-labelledby="dev-title">\n'
  + '    <h1 id="dev-title" data-i18n="dev.h1">DEV ENVIRONMENT DETECTED</h1>\n'
  + '    <p data-i18n="dev.body">This device or account has been marked as a development (dev) environment in Nivelato. The red DEV ENVIRONMENT DETECTED screen is an alarm state, not an error and not a punishment.</p>\n'
  + '  </section>\n'
  + '\n'
  + '  <nav class="toc">\n'
  + '    <a href="#meaning" data-i18n="toc.meaning">What this means</a>\n'
  + '    <a href="#now" data-i18n="toc.now">What to do now</a>\n'
  + '    <a href="#exit" data-i18n="toc.exit">Turn it off</a>\n'
  + '    <a href="#origin" data-i18n="toc.origin">How it turned on</a>\n'
  + '    <a href="#back" data-i18n="toc.back">If it comes back</a>\n'
  + '    <a href="#faq" data-i18n="toc.faq">Questions</a>\n'
  + '  </nav>\n'
  + '\n'
  + '  <section id="meaning" aria-labelledby="meaning-h">\n'
  + '    <h2 id="meaning-h" data-i18n="meaning.h2">What this means</h2>\n'
  + '    <p data-i18n="meaning.p1">The dev flag marks this device as a development environment. While it is active, some action restrictions can be lifted, such as permission restrictions.</p>\n'
  + '    <p data-i18n="meaning.p2">You will also see the warning in more places: a red panel at the top of sign-in cards, and an extra confirmation step if you try to sign in while the flag is on.</p>\n'
  + '    <p data-i18n="meaning.p3">The mark is stored on this device, so it stays active on this device until you turn it off.</p>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="now" aria-labelledby="now-h">\n'
  + '    <h2 id="now-h" data-i18n="now.h2">What to do right now</h2>\n'
  + '    <ul>\n'
  + '      <li data-i18n="now.li1"><b>Stop.</b> Do not do real production work while the flag is on.</li>\n'
  + '      <li data-i18n="now.li2">Using a dev environment strongly increases the risk of data loss.</li>\n'
  + '      <li data-i18n="now.li3">If a dialog asks whether you are sure you want to sign in, choose <b>Cancel</b>. Signing in is exactly the action the warning is about.</li>\n'
  + '      <li data-i18n="now.li4">Turn the flag off (next section) before you keep working.</li>\n'
  + '    </ul>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="exit" aria-labelledby="exit-h">\n'
  + '    <h2 id="exit-h" data-i18n="exit.h2">How to turn it off</h2>\n'
  + '    <p data-i18n="exit.intro">The flag is turned off from the Nivelato page itself, with a keyboard shortcut.</p>\n'
  + '    <ol class="step-flow">\n'
  + '      <li data-i18n="exit.s1"><b>Go to the Nivelato page</b> where you see the red screen or the sign-in card.</li>\n'
  + '      <li data-i18n="exit.s2"><b>Click outside any text field.</b> The shortcut is ignored while the cursor is in an input field.</li>\n'
  + '      <li data-i18n="exit.s3"><b>Press Ctrl+Alt+B once.</b> On a Mac, that is Control+Option+B.</li>\n'
  + '      <li data-i18n="exit.s4"><b>Check the result.</b> The red screen should be gone. Do not press the keys again until you have checked: the same keys cycle the mark, so an extra press can turn a mark back on.</li>\n'
  + '    </ol>\n'
  + '    <p class="note" data-i18n="exit.note">If the sign-in dialog is open, pressing Ctrl+Alt+B turns the flag off and closes the dialog.</p>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="origin" aria-labelledby="origin-h">\n'
  + '    <h2 id="origin-h" data-i18n="origin.h2">How did this get turned on?</h2>\n'
  + '    <p data-i18n="origin.p1">The mark is set from a sign-in page with the same Ctrl+Alt+B shortcut. Each press moves to the next state: no mark, then production, then dev, then off again. Reaching dev takes two presses from off.</p>\n'
  + '    <p data-i18n="origin.p2">Because the shortcut uses keys only, it can be pressed without noticing, for example while reaching for another shortcut. The note that explains it, at the bottom of the sign-in card, stays hidden until Ctrl+Alt+D reveals it.</p>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="back" aria-labelledby="back-h">\n'
  + '    <h2 id="back-h" data-i18n="back.h2">If the screen comes back</h2>\n'
  + '    <ul>\n'
  + '      <li data-i18n="back.li1"><b>You pressed the keys more than once.</b> The keys cycle the mark: one extra press sets the production mark, and one more sets dev again. Press once, then check.</li>\n'
  + '      <li data-i18n="back.li2"><b>You dismissed the sign-in dialog with Ctrl+Alt+Shift+B.</b> That chord closes only the dialog; the flag stays on and the dialog will return. Use Ctrl+Alt+B to turn the flag off.</li>\n'
  + '      <li data-i18n="back.li3"><b>You are on a different device or browser.</b> Each device keeps its own mark, so turn it off on the device that shows the screen.</li>\n'
  + '      <li data-i18n="back.li4"><b>The cursor was in a text field</b> when you pressed the keys. The shortcut is ignored while typing. Click outside the field and press Ctrl+Alt+B once.</li>\n'
  + '    </ul>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="faq" class="faq" aria-labelledby="faq-h">\n'
  + '    <h2 id="faq-h" data-i18n="faq.h2">Questions</h2>\n'
  + '    <details>\n'
  + '      <summary data-i18n="faq.q1">Is my account in trouble?</summary>\n'
  + '      <div class="a" data-i18n="faq.a1">No. The screen is an alarm state, not an error and not a punishment. It means this device carries a dev mark, and it goes away when the mark is turned off.</div>\n'
  + '    </details>\n'
  + '    <details>\n'
  + '      <summary data-i18n="faq.q2">Did the flag change or delete my data?</summary>\n'
  + '      <div class="a" data-i18n="faq.a2">The flag itself does not delete anything. The risk is in using the app while it is on: with restrictions lifted, actions that are normally blocked can go through, and that is where data loss can happen. Turn the flag off before doing real work.</div>\n'
  + '    </details>\n'
  + '    <details>\n'
  + '      <summary data-i18n="faq.q3">I pressed Ctrl+Alt+B and nothing happened. Why?</summary>\n'
  + '      <div class="a" data-i18n="faq.a3">The shortcut is ignored while the cursor is in a text field, and it works on the Nivelato pages that carry the mark controls, such as the sign-in page and the page showing the red screen. Click outside any field, stay on that page, and press it once.</div>\n'
  + '    </details>\n'
  + '    <details>\n'
  + '      <summary data-i18n="faq.q4">What is the production mark?</summary>\n'
  + '      <div class="a" data-i18n="faq.a4">Ctrl+Alt+B cycles three states: off, production, and dev. Production is the normal mark for a device used for real work, and the sign-in card can show a line that reads Current mark: PRODUCTION env. Only the dev state raises the red alarm.</div>\n'
  + '    </details>\n'
  + '    <details>\n'
  + '      <summary data-i18n="faq.q5">The red screen covers the whole page. How do I reach the keys?</summary>\n'
  + '      <div class="a" data-i18n="faq.a5">You do not need to click anything on the red screen. With the screen showing, press Ctrl+Alt+B once: the flag turns off and the screen closes.</div>\n'
  + '    </details>\n'
  + '  </section>\n'
  + '\n'
  + '  <section id="more" aria-labelledby="more-h">\n'
  + '    <h2 id="more-h" data-i18n="more.h2">More help</h2>\n'
  + '    <p data-i18n="more.p">Still stuck? Go back to the <a href="/">help center</a> for the rest of the guides, or write to <a href="mailto:support@nivelatolabs.com">support@nivelatolabs.com</a>.</p>\n'
  + '  </section>\n'
  + '</main>\n'
  + '<footer>\n'
  + '  <span data-i18n="footer.brand">Nivelato · Help Center</span><br>\n'
  + '  <a href="privacy.html" data-i18n="footer.privacy">Privacy policy</a>\n'
  + '</footer>\n'
  + '<script>\n'
  + 'var I18N = {\n'
  + '  en: {\n'
  + '    "meta.title": "Dev environment - Nivelato Support",\n'
  + '    "meta.desc": "What the red DEV ENVIRONMENT DETECTED screen means, why you should stop working while the dev flag is on, and how to turn it off with Ctrl+Alt+B.",\n'
  + '    "header.h1": "Nivelato Support",\n'
  + '    "header.sub": "Dev environment warning: what it means and how to turn it off",\n'
  + '    "nav.back": "Back to the help center",\n'
  + '    "dev.h1": "DEV ENVIRONMENT DETECTED",\n'
  + '    "dev.body": "This device or account has been marked as a development (dev) environment in Nivelato. The red DEV ENVIRONMENT DETECTED screen is an alarm state, not an error and not a punishment.",\n'
  + '    "toc.meaning": "What this means",\n'
  + '    "toc.now": "What to do now",\n'
  + '    "toc.exit": "Turn it off",\n'
  + '    "toc.origin": "How it turned on",\n'
  + '    "toc.back": "If it comes back",\n'
  + '    "toc.faq": "Questions",\n'
  + '    "meaning.h2": "What this means",\n'
  + '    "meaning.p1": "The dev flag marks this device as a development environment. While it is active, some action restrictions can be lifted, such as permission restrictions.",\n'
  + '    "meaning.p2": "You will also see the warning in more places: a red panel at the top of sign-in cards, and an extra confirmation step if you try to sign in while the flag is on.",\n'
  + '    "meaning.p3": "The mark is stored on this device, so it stays active on this device until you turn it off.",\n'
  + '    "now.h2": "What to do right now",\n'
  + '    "now.li1": "<b>Stop.</b> Do not do real production work while the flag is on.",\n'
  + '    "now.li2": "Using a dev environment strongly increases the risk of data loss.",\n'
  + '    "now.li3": "If a dialog asks whether you are sure you want to sign in, choose <b>Cancel</b>. Signing in is exactly the action the warning is about.",\n'
  + '    "now.li4": "Turn the flag off (next section) before you keep working.",\n'
  + '    "exit.h2": "How to turn it off",\n'
  + '    "exit.intro": "The flag is turned off from the Nivelato page itself, with a keyboard shortcut.",\n'
  + '    "exit.s1": "<b>Go to the Nivelato page</b> where you see the red screen or the sign-in card.",\n'
  + '    "exit.s2": "<b>Click outside any text field.</b> The shortcut is ignored while the cursor is in an input field.",\n'
  + '    "exit.s3": "<b>Press Ctrl+Alt+B once.</b> On a Mac, that is Control+Option+B.",\n'
  + '    "exit.s4": "<b>Check the result.</b> The red screen should be gone. Do not press the keys again until you have checked: the same keys cycle the mark, so an extra press can turn a mark back on.",\n'
  + '    "exit.note": "If the sign-in dialog is open, pressing Ctrl+Alt+B turns the flag off and closes the dialog.",\n'
  + '    "origin.h2": "How did this get turned on?",\n'
  + '    "origin.p1": "The mark is set from a sign-in page with the same Ctrl+Alt+B shortcut. Each press moves to the next state: no mark, then production, then dev, then off again. Reaching dev takes two presses from off.",\n'
  + '    "origin.p2": "Because the shortcut uses keys only, it can be pressed without noticing, for example while reaching for another shortcut. The note that explains it, at the bottom of the sign-in card, stays hidden until Ctrl+Alt+D reveals it.",\n'
  + '    "back.h2": "If the screen comes back",\n'
  + '    "back.li1": "<b>You pressed the keys more than once.</b> The keys cycle the mark: one extra press sets the production mark, and one more sets dev again. Press once, then check.",\n'
  + '    "back.li2": "<b>You dismissed the sign-in dialog with Ctrl+Alt+Shift+B.</b> That chord closes only the dialog; the flag stays on and the dialog will return. Use Ctrl+Alt+B to turn the flag off.",\n'
  + '    "back.li3": "<b>You are on a different device or browser.</b> Each device keeps its own mark, so turn it off on the device that shows the screen.",\n'
  + '    "back.li4": "<b>The cursor was in a text field</b> when you pressed the keys. The shortcut is ignored while typing. Click outside the field and press Ctrl+Alt+B once.",\n'
  + '    "faq.h2": "Questions",\n'
  + '    "faq.q1": "Is my account in trouble?",\n'
  + '    "faq.a1": "No. The screen is an alarm state, not an error and not a punishment. It means this device carries a dev mark, and it goes away when the mark is turned off.",\n'
  + '    "faq.q2": "Did the flag change or delete my data?",\n'
  + '    "faq.a2": "The flag itself does not delete anything. The risk is in using the app while it is on: with restrictions lifted, actions that are normally blocked can go through, and that is where data loss can happen. Turn the flag off before doing real work.",\n'
  + '    "faq.q3": "I pressed Ctrl+Alt+B and nothing happened. Why?",\n'
  + '    "faq.a3": "The shortcut is ignored while the cursor is in a text field, and it works on the Nivelato pages that carry the mark controls, such as the sign-in page and the page showing the red screen. Click outside any field, stay on that page, and press it once.",\n'
  + '    "faq.q4": "What is the production mark?",\n'
  + '    "faq.a4": "Ctrl+Alt+B cycles three states: off, production, and dev. Production is the normal mark for a device used for real work, and the sign-in card can show a line that reads Current mark: PRODUCTION env. Only the dev state raises the red alarm.",\n'
  + '    "faq.q5": "The red screen covers the whole page. How do I reach the keys?",\n'
  + '    "faq.a5": "You do not need to click anything on the red screen. With the screen showing, press Ctrl+Alt+B once: the flag turns off and the screen closes.",\n'
  + '    "more.h2": "More help",\n'
  + '    "more.p": "Still stuck? Go back to the <a href=\\"/\\">help center</a> for the rest of the guides, or write to <a href=\\"mailto:support@nivelatolabs.com\\">support@nivelatolabs.com</a>.",\n'
  + '    "footer.brand": "Nivelato · Help Center",\n'
  + '    "footer.privacy": "Privacy policy"\n'
  + '  },\n'
  + '  es: {\n'
  + '    "meta.title": "Entorno dev - Soporte de Nivelato",\n'
  + '    "meta.desc": "Qué significa la pantalla roja de ENTORNO DEV DETECTADO, por qué debes detener tu trabajo mientras la marca dev está activa y cómo desactivarla con Ctrl+Alt+B.",\n'
  + '    "header.h1": "Soporte de Nivelato",\n'
  + '    "header.sub": "Aviso de entorno dev: qué significa y cómo desactivarlo",\n'
  + '    "nav.back": "Volver al centro de ayuda",\n'
  + '    "dev.h1": "ENTORNO DEV DETECTADO",\n'
  + '    "dev.body": "Este dispositivo o cuenta ha sido marcado como un entorno de desarrollo (dev) en Nivelato. La pantalla roja de ENTORNO DEV DETECTADO es un estado de alarma, no un error ni un castigo.",\n'
  + '    "toc.meaning": "Qué significa",\n'
  + '    "toc.now": "Qué hacer ahora",\n'
  + '    "toc.exit": "Cómo desactivarlo",\n'
  + '    "toc.origin": "Cómo se activó",\n'
  + '    "toc.back": "Si vuelve a aparecer",\n'
  + '    "toc.faq": "Preguntas",\n'
  + '    "meaning.h2": "Qué significa",\n'
  + '    "meaning.p1": "La marca dev identifica este dispositivo como un entorno de desarrollo. Mientras está activa, algunas restricciones de acciones pueden levantarse, como las restricciones de permisos.",\n'
  + '    "meaning.p2": "También vas a ver el aviso en más lugares: un panel rojo en la parte superior de las tarjetas de inicio de sesión y un paso de confirmación adicional si intentas iniciar sesión con la marca activa.",\n'
  + '    "meaning.p3": "La marca se guarda en este dispositivo, así que se mantiene activa en él hasta que la desactives.",\n'
  + '    "now.h2": "Qué hacer ahora mismo",\n'
  + '    "now.li1": "<b>Detente.</b> No hagas trabajo real de producción mientras la marca esté activa.",\n'
  + '    "now.li2": "Usar un entorno dev aumenta fuertemente el riesgo de pérdida de datos.",\n'
  + '    "now.li3": "Si aparece un diálogo preguntando si estás seguro de que quieres iniciar sesión, elige <b>Cancelar</b>. Iniciar sesión es justamente la acción sobre la que advierte el aviso.",\n'
  + '    "now.li4": "Desactiva la marca (siguiente sección) antes de seguir trabajando.",\n'
  + '    "exit.h2": "Cómo desactivarla",\n'
  + '    "exit.intro": "La marca se desactiva desde la propia página de Nivelato, con un atajo de teclado.",\n'
  + '    "exit.s1": "<b>Ve a la página de Nivelato</b> donde ves la pantalla roja o la tarjeta de inicio de sesión.",\n'
  + '    "exit.s2": "<b>Haz clic fuera de cualquier campo de texto.</b> El atajo se ignora mientras el cursor está en un campo.",\n'
  + '    "exit.s3": "<b>Presiona Ctrl+Alt+B una vez.</b> En Mac, es Control+Option+B.",\n'
  + '    "exit.s4": "<b>Verifica el resultado.</b> La pantalla roja debe desaparecer. No presiones las teclas otra vez hasta verificar: las mismas teclas cambian la marca, así que una presión extra puede volver a activarla.",\n'
  + '    "exit.note": "Si el diálogo de inicio de sesión está abierto, presionar Ctrl+Alt+B desactiva la marca y cierra el diálogo.",\n'
  + '    "origin.h2": "¿Cómo se activó?",\n'
  + '    "origin.p1": "La marca se activa desde una página de inicio de sesión con ese mismo atajo, Ctrl+Alt+B. Cada presión pasa al siguiente estado: sin marca, producción, dev y apagado otra vez. Llegar a dev toma dos presiones desde apagado.",\n'
  + '    "origin.p2": "Como el atajo usa solo teclas, puede presionarse sin darse cuenta, por ejemplo al buscar otro atajo. La nota que lo explica, al pie de la tarjeta de inicio de sesión, permanece oculta hasta que Ctrl+Alt+D la revela.",\n'
  + '    "back.h2": "Si la pantalla vuelve a aparecer",\n'
  + '    "back.li1": "<b>Presionaste las teclas más de una vez.</b> Las teclas rotan la marca: una presión extra pone la marca de producción y otra más vuelve a poner dev. Presiona una vez y verifica.",\n'
  + '    "back.li2": "<b>Descartaste el diálogo de inicio de sesión con Ctrl+Alt+Shift+B.</b> Ese atajo solo cierra el diálogo; la marca sigue activa y el diálogo va a volver. Usa Ctrl+Alt+B para desactivar la marca.",\n'
  + '    "back.li3": "<b>Estás en otro dispositivo o navegador.</b> Cada dispositivo guarda su propia marca, así que desactívala en el dispositivo que muestra la pantalla.",\n'
  + '    "back.li4": "<b>El cursor estaba en un campo de texto</b> cuando presionaste las teclas. El atajo se ignora mientras escribes. Haz clic fuera del campo y presiona Ctrl+Alt+B una vez.",\n'
  + '    "faq.h2": "Preguntas frecuentes",\n'
  + '    "faq.q1": "¿Mi cuenta tiene un problema?",\n'
  + '    "faq.a1": "No. La pantalla es un estado de alarma, no un error ni un castigo. Significa que este dispositivo tiene la marca dev, y desaparece cuando la marca se desactiva.",\n'
  + '    "faq.q2": "¿La marca cambió o borró mis datos?",\n'
  + '    "faq.a2": "La marca en sí no borra nada. El riesgo está en usar la app mientras está activa: con las restricciones levantadas, acciones que normalmente están bloqueadas pueden completarse, y ahí es donde puede haber pérdida de datos. Desactiva la marca antes de hacer trabajo real.",\n'
  + '    "faq.q3": "Presioné Ctrl+Alt+B y no pasó nada. ¿Por qué?",\n'
  + '    "faq.a3": "El atajo se ignora mientras el cursor está en un campo de texto, y funciona en las páginas de Nivelato que tienen los controles de la marca, como la página de inicio de sesión y la que muestra la pantalla roja. Haz clic fuera de cualquier campo, quédate en esa página y presiona una vez.",\n'
  + '    "faq.q4": "¿Qué es la marca de producción?",\n'
  + '    "faq.a4": "Ctrl+Alt+B rota tres estados: apagado, producción y dev. Producción es la marca normal de un dispositivo usado para trabajo real, y la tarjeta de inicio de sesión puede mostrar una línea que dice Marca actual: entorno de PRODUCCIÓN. Solo el estado dev levanta la alarma roja.",\n'
  + '    "faq.q5": "La pantalla roja cubre toda la página. ¿Cómo llego a las teclas?",\n'
  + '    "faq.a5": "No tienes que hacer clic en nada de la pantalla roja. Con la pantalla visible, presiona Ctrl+Alt+B una vez: la marca se desactiva y la pantalla se cierra.",\n'
  + '    "more.h2": "Más ayuda",\n'
  + '    "more.p": "¿Todavía no resuelve? Vuelve al <a href=\\"/\\">centro de ayuda</a> para ver el resto de las guías, o escríbenos a <a href=\\"mailto:support@nivelatolabs.com\\">support@nivelatolabs.com</a>.",\n'
  + '    "footer.brand": "Nivelato · Centro de ayuda",\n'
  + '    "footer.privacy": "Política de privacidad"\n'
  + '  }\n'
  + '};\n'
  + 'var FORCED_LANG = null;\n'
  + 'var LANG_KEY = \'nivelato-lang\';\n'
  + 'function currentLang() {\n'
  + '  try {\n'
  + '    var cm = (\'; \' + document.cookie).match(/; nivelato-login-lang=(es|en)(?:;|$)/);\n'
  + '    if (cm) return cm[1];\n'
  + '  } catch (e) {}\n'
  + '  try {\n'
  + '    var saved = localStorage.getItem(LANG_KEY);\n'
  + '    if (saved === \'en\' || saved === \'es\') return saved;\n'
  + '  } catch (e) {}\n'
  + '  if (FORCED_LANG) return FORCED_LANG;\n'
  + '  var nav = (navigator.language || \'en\').toLowerCase();\n'
  + '  return nav.indexOf(\'es\') === 0 ? \'es\' : \'en\';\n'
  + '}\n'
  + 'function applyLang(l) {\n'
  + '  var dict = I18N[l] || I18N.en;\n'
  + '  document.documentElement.lang = l;\n'
  + '  if (dict[\'meta.title\']) document.title = dict[\'meta.title\'];\n'
  + '  var metaDescEl = document.querySelector(\'meta[name="description"]\');\n'
  + '  if (metaDescEl && dict[\'meta.desc\']) metaDescEl.setAttribute(\'content\', dict[\'meta.desc\']);\n'
  + '  document.querySelectorAll(\'[data-i18n]\').forEach(function (el) {\n'
  + '    var k = el.getAttribute(\'data-i18n\');\n'
  + '    if (dict[k] !== undefined) el.innerHTML = dict[k];\n'
  + '  });\n'
  + '  document.querySelectorAll(\'.lang-toggle\').forEach(function (b) { b.textContent = (l === \'en\') ? \'ES\' : \'EN\'; });\n'
  + '  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}\n'
  + '}\n'
  + 'document.querySelectorAll(\'.lang-toggle\').forEach(function (b) {\n'
  + '  b.addEventListener(\'click\', function () {\n'
  + '    var cur = document.documentElement.lang === \'es\' ? \'es\' : \'en\';\n'
  + '    applyLang(cur === \'en\' ? \'es\' : \'en\');\n'
  + '  });\n'
  + '});\n'
  + 'applyLang(currentLang());\n'
  + '</' + 'script>'
  + '\n'
  + '</body>\n'
  + '</html>\n';

var CT = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf"
};

addEventListener("fetch", function (event) {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  var url = new URL(request.url);
  var path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/dev") {
    return new Response(DEV_HTML, {
      status: 200,
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
    });
  }
  // /dashboard.html lives on the dashboard subdomain (Giulia, 2026-10-29):
  // bounce the file path there with a permanent redirect, query preserved.
  if (path === "/dashboard.html") {
    return Response.redirect("https://dashboard.nivelatolabs.com/" + url.search, 301);
  }
  var target = null;
  if (Object.prototype.hasOwnProperty.call(ROUTES, path)) {
    target = RAW + "/" + DIR + ROUTES[path];
  } else if (/\.[a-z0-9]+$/i.test(path)) {
    // Shared root asset (niv-dark.css, company-theme.js, press-yaoi.js,
    // images, manifest.json, privacy.html): proxied from the repo root,
    // like the beta worker does.
    target = RAW + path;
  }
  if (!target) {
    return new Response("No encontrado.", {
      status: 404, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  var upstream;
  try {
    upstream = await fetch(target + url.search, { redirect: "manual" });
  } catch (e) {
    return new Response("Nivelato no disponible ahora mismo. Intenta de nuevo.", {
      status: 502, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  if (upstream.status === 404) {
    return new Response("No encontrado.", {
      status: 404, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  var dot = target.lastIndexOf(".");
  var ct = CT[target.slice(dot).toLowerCase()] || "application/octet-stream";
  var headers = new Headers();
  headers.set("content-type", ct);
  headers.set("cache-control", ct.indexOf("text/html") === 0 ? "no-store" : "public, max-age=300");
  return new Response(upstream.body, { status: upstream.status, headers: headers });
}
