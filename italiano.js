// italiano.js — type "nivelato" (not focused in a field) and the whole app
// goes full Italian. Mamma mia. Toggle off by typing it again.
// Pure vibes. No app logic touched.
(function () {
  const LS_KEY = 'nivelato-italiano';
  let enabled = localStorage.getItem(LS_KEY) === '1';
  let keyBuffer = '';

  // ES → IT string swaps. Order matters: longest/most specific first.
  const SWAPS = [
    // headers / titles
    ['Medidas de campo para instaladores de vidrio', 'Misure sul campo per installatori di vetro'],
    ['Historial de medidas', 'Storico delle misure'],
    ['Cliente / Proyecto', 'Cliente / Progetto'],
    ['Medidas del hueco', 'Misure del vano'],
    ['Pared izquierda', 'Parete sinistra'],
    ['Pared derecha', 'Parete destra'],
    ['Arriba', 'Sopra'],
    ['Abajo', 'Sotto'],
    ['Foto con medidas', 'Foto con misure'],
    ['Resumen', 'Riepilogo'],
    ['Siguiente →', 'Avanti →'],
    ['← Atrás', '← Indietro'],
    ['Omitir', 'Salta'],
    ['Agregar foto', 'Aggiungi foto'],
    ['Cambiar foto', 'Cambia foto'],
    ['Editar', 'Modifica'],
    ['Quitar', 'Rimuovi'],
    ['Compartir', 'Condividi'],
    ['Cerrar sesión', 'Esci'],
    ['Nueva medida', 'Nuova misura'],
    ['Iniciar sesión', 'Accedi'],
    ['Registrarse', 'Registrati'],
    ['Crear cuenta', 'Crea account'],
    ['Entrar', 'Entra'],
    ['Correo electrónico', 'Email'],
    ['Contraseña', 'Password'],
    ['Nombre completo', 'Nome completo'],
    ['Nombre del taller', 'Nome dell\'officina'],
    ['Código del taller', 'Codice dell\'officina'],
    ['Técnico medidor', 'Tecnico misuratore'],
    ['Supervisor de campo', 'Supervisore di campo'],
    ['Cotizaciones', 'Preventivi'],
    ['Dueño / Administrador', 'Proprietario / Amministratore'],
    ['Todos los técnicos', 'Tutti i tecnici'],
    ['Todos los clientes', 'Tutti i clienti'],
    ['Filtrar por fecha', 'Filtra per data'],
    ['Medidas totales', 'Misure totali'],
    ['Hoy', 'Oggi'],
    ['Con advertencias', 'Con avvertenze'],
    ['Cerrar', 'Chiudi'],
    ['Eliminar medida', 'Elimina misura'],
    ['Compartir medida', 'Condividi misura'],
    // hints
    ['Ingresa el nombre del cliente, proyecto y ubicación antes de empezar a medir.', 'Inserisci il nome del cliente, progetto e ubicazione prima di iniziare a misurare.'],
    ['Ingresa las 2 medidas base: ancho abajo y alto izquierda. Las otras 2 se calculan automáticamente con los desniveles.', 'Inserisci le 2 misure base: larghezza sotto e altezza sinistra. Le altre 2 si calcolano automaticamente con i dislivelli.'],
    ['Mide del láser a la pared izquierda: punto A (abajo) y punto B (arriba).', 'Misura dal laser alla parete sinistra: punto A (sotto) e punto B (sopra).'],
    ['Mide del láser a la pared derecha: punto A (abajo) y punto B (arriba).', 'Misura dal laser alla parete destra: punto A (sotto) e punto B (sopra).'],
    ['Mide del láser arriba: punto A (izquierda) y punto B (derecha).', 'Misura dal laser in alto: punto A (sinistra) e punto B (destra).'],
    ['Mide del láser abajo: punto A (izquierda) y punto B (derecha).', 'Misura dal laser in basso: punto A (sinistra) e punto B (destra).'],
    ['Opcional: agrega una foto del hueco y márcala con las medidas para que el taller la vea.', 'Opzionale: aggiungi una foto del vano e segnala le misure per farle vedere all\'officina.'],
    ['Notas', 'Note'],
    ['Observaciones adicionales...', 'Osservazioni aggiuntive...'],
    ['Verifique todas las medidas calculadas con mediciones manuales antes de cotizar o instalar.', 'Verifica tutte le misure calcolate con misurazioni manuali prima di preventivare o installare.'],
    ['Cliente', 'Cliente'],
    ['Proyecto', 'Progetto'],
    ['Ubicación', 'Ubicazione'],
    ['A — Abajo', 'A — Sotto'],
    ['B — Arriba', 'B — Sopra'],
    ['A — Izquierda', 'A — Sinistra'],
    ['B — Derecha', 'B — Destra'],
  ];

  function translate(text) {
    for (const [es, it] of SWAPS) {
      if (text.includes(es)) return text.replace(es, it);
    }
    return text;
  }

  function applyTexts(root) {
    if (!enabled) return;
    root = root || document;
    // walk text nodes (skip script/style)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'textarea') return NodeFilter.FILTER_REJECT;
        if (p.hasAttribute && p.hasAttribute('data-italiano')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const t = n.nodeValue;
      if (!t || !t.trim()) continue;
      const translated = translate(t);
      if (translated !== t) n.nodeValue = translated;
    }
  }

  function addFlag() {
    if (!enabled) return;
    if (document.getElementById('italiano-flag')) return;
    const flag = document.createElement('span');
    flag.id = 'italiano-flag';
    flag.textContent = '🇮🇹';
    flag.style.cssText = 'font-size:16px;margin-left:8px;vertical-align:middle;';
    const header = document.querySelector('#app-header, header');
    if (header) header.appendChild(flag);
  }

  function removeFlag() {
    const f = document.getElementById('italiano-flag');
    if (f) f.remove();
  }

  function applyTheme(state) {
    enabled = state;
    localStorage.setItem(LS_KEY, state ? '1' : '0');
    document.body.classList.toggle('italiano-mode', state);
    console.log('[italiano] applyTheme ->', state, 'enabled=', enabled);
    if (state) { applyTexts(); addFlag(); }
    else removeFlag();
  }

  // re-translate dynamically added content (e.g. dashboard job list).
  // Debounced + guarded so our own text mutations don't re-trigger the
  // observer in an infinite loop (which would throw before keydown is set up).
  let obsTimer = null;
  let applying = false;
  const observer = new MutationObserver(() => {
    if (applying) return;
    if (obsTimer) clearTimeout(obsTimer);
    obsTimer = setTimeout(() => {
      if (!enabled) return;
      applying = true;
      try { applyTexts(document.body); } finally { applying = false; }
    }, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false });

  document.addEventListener('keydown', function (e) {
    const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const key = e.key?.toLowerCase();
    if (!key || key.length !== 1) return;
    keyBuffer = (keyBuffer + key).slice(-9);
    if (keyBuffer === 'nivelato' || keyBuffer === 'bavelloni') {
      keyBuffer = '';
      // defocus any text field so the mode applies cleanly (and doesn't
      // get eaten by an input)
      const active = document.activeElement;
      if (active && typeof active.blur === 'function') active.blur();
      applyTheme(!enabled);
      // tiny feedback
      const toast = document.createElement('div');
      toast.textContent = enabled ? '🍝 Mamma mia, tutto in italiano!' : '↩️ Di nuovo in spagnolo';
      toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1d1d1d;color:#fff;padding:10px 18px;border-radius:24px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:fadeInOut 2s ease forwards;pointer-events:none;';
      if (!document.getElementById('italiano-toast-style')) {
        const s = document.createElement('style');
        s.id = 'italiano-toast-style';
        s.textContent = '@keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(8px)} 15%{opacity:1;transform:translateX(-50%) translateY(0)} 80%{opacity:1} 100%{opacity:0} }';
        document.head.appendChild(s);
      }
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2100);
    }
  });

  // init
  if (enabled) { document.body.classList.add('italiano-mode'); applyTexts(); addFlag(); }
})();
