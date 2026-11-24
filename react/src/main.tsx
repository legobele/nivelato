import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import './styles.css';
document.documentElement.dataset.serif = 'is';
createRoot(document.getElementById('root')!).render(<HashRouter><App /></HashRouter>);

if ('serviceWorker' in navigator && import.meta.env.PROD && !new URLSearchParams(location.search).has('nosw')) window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
