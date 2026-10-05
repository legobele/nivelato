// yaoi.js — sometimes, when you press a key, the console just says "yaoi".
// No reason. It doesn't do anything else. That's the whole thing.
// (3% chance per keypress. The console is a mysterious place.)
document.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (Math.random() < 0.03) {
    console.log('%c yaoi ', 'background:#ff8cc6;color:#1a1a1e;font-weight:bold;padding:2px 8px;border-radius:4px;');
  }
});
