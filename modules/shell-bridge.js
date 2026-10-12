/* modules/shell-bridge.js: embed side helper for the Nivelato chrome
   modules. Host pages include this classic script and call:
     window.NivShell.mountSidebar(el, opts)
     window.NivShell.mountTopbar(el, opts)
   Contract (locked, see modules/README.md): every message is an object
   { niv: 1, type, ... }. Types:
     niv:ready   module to host  { target }
     niv:init    host to module  { target, active, section, lang }
                   (topbar init also accepts a project field)
     niv:nav     module to host  { href }   host navigates the top frame
     niv:resize  module to host  { height } host sizes the iframe
     niv:section module to host  { section } user target sub nav clicks
   Both sides validate event.origin === location.origin. The bridge
   never navigates to an href whose origin differs from the host origin.
*/
(function () {
  'use strict';
  if (window.NivShell) return;

  function resolveEl(el) {
    if (!el) return null;
    if (typeof el === 'string') return document.querySelector(el);
    return el;
  }
  function langOf(opts) {
    if (opts.lang === 'es' || opts.lang === 'en') return opts.lang;
    try {
      var m = document.cookie.match(/(?:^|; )nivelato-login-lang=([^;]*)/);
      if (m) { var v = decodeURIComponent(m[1]); if (v === 'es' || v === 'en') return v; }
    } catch (e) { /* cookies unavailable */ }
    try {
      var ls = window.localStorage.getItem('nivelato-login-lang');
      if (ls === 'es' || ls === 'en') return ls;
    } catch (e) { /* storage unavailable */ }
    return 'es';
  }
  function sameOriginHref(href) {
    if (typeof href !== 'string' || !href) return null;
    try {
      var u = new URL(href, window.location.origin);
      return u.origin === window.location.origin ? u.href : null;
    } catch (e) { return null; }
  }

  function mount(el, opts, kind) {
    var host = resolveEl(el);
    if (!host) throw new Error('NivShell: mount target element not found');
    opts = opts || {};
    var isSidebar = kind === 'sidebar';
    var target = isSidebar
      ? (opts.target === 'user' || opts.target === 'shell' ? opts.target : 'company')
      : 'topbar';

    var qs = new URLSearchParams();
    if (isSidebar) {
      qs.set('target', target);
      if (opts.demo) qs.set('demo', '1');
      if (opts.active) qs.set('active', String(opts.active));
      if (opts.section) qs.set('section', String(opts.section));
    } else {
      if (opts.active) qs.set('active', String(opts.active));
      if (opts.project) qs.set('project', String(opts.project));
    }
    var lang = langOf(opts);
    qs.set('lang', lang);
    var src = (isSidebar ? '/modules/sidebar.html?' : '/modules/topbar.html?') + qs.toString();

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.className = isSidebar ? 'niv-shell-frame niv-sidebar-frame' : 'niv-shell-frame niv-topbar-frame';
    iframe.title = opts.title || (isSidebar ? 'Nivelato sidebar' : 'Nivelato topbar');
    iframe.setAttribute('frameborder', '0');
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.width = '100%';
    iframe.style.background = 'transparent';

    /* Height modes. Sidebar company and shell default: fixed (the
       iframe fills the host box and the module scrolls internally).
       Sidebar user and topbar default: auto (the iframe follows
       niv:resize). opts.height (px number or CSS string) forces fixed
       mode at that height. */
    var heightMode = opts.heightMode || (opts.height != null ? 'fixed' : (isSidebar && target !== 'user' ? 'fixed' : 'auto'));
    function applyFixedHeight() {
      if (opts.height != null) {
        iframe.style.height = typeof opts.height === 'number' ? opts.height + 'px' : String(opts.height);
      } else if (isSidebar) {
        iframe.style.height = '100%';
      } else {
        iframe.style.height = '60px';
      }
    }
    if (heightMode === 'fixed') applyFixedHeight();
    else iframe.style.height = isSidebar ? '200px' : '60px'; /* until first niv:resize */

    var state = {
      target: target,
      active: opts.active || null,
      section: opts.section || null,
      lang: lang,
      project: opts.project || null
    };
    function sendInit() {
      if (!iframe.contentWindow) return;
      var msg = { niv: 1, type: 'niv:init', target: state.target, lang: state.lang };
      if (state.active) msg.active = state.active;
      if (state.section) msg.section = state.section;
      if (!isSidebar && state.project != null) msg.project = state.project;
      try { iframe.contentWindow.postMessage(msg, window.location.origin); } catch (e) { /* not loaded yet */ }
    }

    function onMessage(ev) {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== iframe.contentWindow) return;
      var d = ev.data;
      if (!d || d.niv !== 1 || typeof d.type !== 'string') return;
      if (d.type === 'niv:ready') {
        sendInit();
        if (typeof opts.onReady === 'function') opts.onReady(d);
      } else if (d.type === 'niv:nav') {
        var href = sameOriginHref(d.href);
        if (!href) return;
        if (typeof opts.onNav === 'function' && opts.onNav(d.href) === false) return;
        window.location.href = href;
      } else if (d.type === 'niv:resize') {
        if (heightMode !== 'auto') return;
        var h = Number(d.height);
        if (isFinite(h) && h > 0 && h < 10000) iframe.style.height = Math.ceil(h) + 'px';
      } else if (d.type === 'niv:section') {
        if (typeof d.section === 'string') state.section = d.section;
        if (typeof opts.onSection === 'function') opts.onSection(d.section);
        try {
          host.dispatchEvent(new CustomEvent('niv:section', { detail: { section: d.section }, bubbles: true }));
        } catch (e) { /* CustomEvent unavailable: callback above is the contract */ }
      }
    }
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', sendInit);
    host.appendChild(iframe);

    return {
      iframe: iframe,
      element: host,
      target: target,
      setActive: function (active) { state.active = active; sendInit(); },
      setSection: function (section) { state.section = section; sendInit(); },
      setLang: function (l) { if (l === 'es' || l === 'en') { state.lang = l; sendInit(); } },
      setProject: function (name) { state.project = name; sendInit(); },
      setHeightMode: function (mode) {
        heightMode = mode === 'fixed' ? 'fixed' : 'auto';
        if (heightMode === 'fixed') applyFixedHeight();
      },
      destroy: function () {
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
    };
  }

  window.NivShell = {
    mountSidebar: function (el, opts) { return mount(el, opts, 'sidebar'); },
    mountTopbar: function (el, opts) { return mount(el, opts, 'topbar'); }
  };
})();
