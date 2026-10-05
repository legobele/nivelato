// firebase-config.js — Nivelato Firebase setup
//
// BYOB (bring-your-own-backend): a shop can paste their own Firebase web
// config in Ajustes → Backend and the app talks to THEIR project instead of
// the default nivelato-app project. The custom config persists in
// localStorage ('nivelato_backend_config'). Email still flows through the
// central project's callable functions (see EMAIL_PIPELINE.md) — data never
// has to live on the central project for notifications to work.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

const defaultConfig = {
  apiKey: "AIzaSyDLOcT2LkztypbqUNmAX6dEdNW9INMxkVw",
  authDomain: "nivelato-app.firebaseapp.com",
  projectId: "nivelato-app",
  storageBucket: "nivelato-app.firebasestorage.app",
  messagingSenderId: "759893408531",
  appId: "1:759893408531:web:696e2da5f004a3bac5f8e6",
  measurementId: "G-J4SF3YMPEK"
};

// ---- BYOB: trae tu propio backend ---------------------------------------
const BACKEND_KEY = 'nivelato_backend_config';
const BACKEND_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

function readCustomConfig() {
  try {
    const raw = window.localStorage.getItem(BACKEND_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return null;
    for (const f of BACKEND_FIELDS) {
      if (typeof cfg[f] !== 'string' || !cfg[f].trim()) return null;
    }
    const out = {};
    for (const f of BACKEND_FIELDS) out[f] = cfg[f].trim();
    return out;
  } catch (_) { return null; }
}

// Config activa: la personalizada si existe y está completa, si no la default.
const customConfig = readCustomConfig();
const activeConfig = customConfig || defaultConfig;

const app = initializeApp(activeConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Las funciones de correo viven SIEMPRE en el proyecto central
// (nivelato-app), aunque el taller use su propio backend. Así las
// notificaciones no dependen de dónde estén los datos.
const centralApp = initializeApp(defaultConfig, 'nivelato-central');
export const centralFunctions = getFunctions(centralApp, 'us-central1');

/** ¿Estamos en un backend personalizado? */
export function isCustomBackend() {
  return !!customConfig;
}

/** Info del backend activo para la UI (nunca expone la apiKey). */
export function getBackendInfo() {
  return {
    isCustom: !!customConfig,
    projectId: (customConfig || defaultConfig).projectId,
  };
}

/** Validación de formato de los 6 campos. Devuelve {ok} o {ok:false, error}. */
export function validateBackendFields(cfg) {
  for (const f of BACKEND_FIELDS) {
    if (!cfg[f] || !String(cfg[f]).trim()) {
      return { ok: false, error: 'Falta el campo: ' + f };
    }
  }
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(cfg.apiKey.trim())) {
    return { ok: false, error: 'La apiKey no tiene el formato de una clave web de Firebase (empieza con AIza...).' };
  }
  if (!/^[a-z0-9-]+$/.test(cfg.projectId.trim())) {
    return { ok: false, error: 'El projectId solo puede tener minúsculas, números y guiones.' };
  }
  return { ok: true };
}

/**
 * Prueba la config contra el backend: inicializa una app temporal y hace
 * una lectura liviana. Devuelve {ok} o {ok:false, error} en español.
 * Cualquier respuesta del servidor (aunque el doc no exista o las reglas
 * nieguen el acceso) significa que la conexión funciona; solo los errores
 * de red o de credenciales se reportan como config inválida.
 */
export async function probeBackendConfig(cfg) {
  const fieldCheck = validateBackendFields(cfg);
  if (!fieldCheck.ok) return fieldCheck;
  const clean = {};
  for (const f of BACKEND_FIELDS) clean[f] = cfg[f].trim();
  let tmp = null;
  try {
    tmp = initializeApp(clean, 'nivelato-probe-' + Date.now());
    const tdb = getFirestore(tmp);
    await getDoc(doc(tdb, 'nivelato_config/version'));
    return { ok: true };
  } catch (e) {
    const code = (e && e.code) || '';
    // permission-denied = el proyecto responde pero sus reglas son
    // estrictas; la conexión en sí funciona.
    if (code === 'permission-denied') {
      return { ok: true, warning: 'Conecta bien, pero revisa las reglas de Firestore del proyecto (ver EMAIL_PIPELINE.md).' };
    }
    if (code === 'unauthenticated' || code === 'invalid-argument') {
      return { ok: false, error: 'La apiKey no fue aceptada por Firebase. Revísala.' };
    }
    return { ok: false, error: 'No se pudo contactar el proyecto (' + (code || 'error de red') + '). Verifica el projectId y tu conexión.' };
  } finally {
    if (tmp) { try { await deleteApp(tmp); } catch (_) {} }
  }
}

/** Guarda la config personalizada (ya validada) y recarga. */
export function saveBackendConfig(cfg) {
  const clean = {};
  for (const f of BACKEND_FIELDS) clean[f] = String(cfg[f] || '').trim();
  window.localStorage.setItem(BACKEND_KEY, JSON.stringify(clean));
}

/** Vuelve al backend default de Nivelato y recarga. */
export function resetBackendConfig() {
  try { window.localStorage.removeItem(BACKEND_KEY); } catch (_) {}
}

// Compat: el resto del código importa `firebaseConfig` en algunos lados.
export const firebaseConfig = activeConfig;
export { defaultConfigCopy as defaultFirebaseConfig };
