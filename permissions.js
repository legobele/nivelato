// permissions.js — shared permission constants and checker
// Imported by auth-guard.js (index.html) and dashboard.html

export const PERM_DEFS = [
  { key: 'viewDashboard',          label: 'Ver dashboard' },
  { key: 'createMeasurements',     label: 'Crear medidas' },
  { key: 'viewOwnMeasurements',    label: 'Ver mis medidas' },
  { key: 'editOwnMeasurements',    label: 'Editar mis medidas' },
  { key: 'viewOthersMeasurements', label: 'Ver medidas de otros' },
  { key: 'editOthersMeasurements', label: 'Editar medidas de otros' },
  { key: 'managePriceList',        label: 'Gestionar lista de precios' },
  { key: 'createQuotes',           label: 'Crear cotizaciones' },
  { key: 'approveQuotes',          label: 'Aprobar cotizaciones' },
  { key: 'userManagement',         label: 'Gestión de usuarios' },
];

const ROLE_FALLBACK = {
  viewDashboard:          true,
  createMeasurements:     ['owner', 'supervisor', 'medidor'],
  viewOwnMeasurements:    true,
  editOwnMeasurements:    ['owner', 'supervisor', 'medidor'],
  viewOthersMeasurements: ['owner', 'supervisor', 'medidor', 'cotizador'],
  editOthersMeasurements: ['owner', 'supervisor'],
  managePriceList:         ['owner', 'supervisor'],
  createQuotes:            ['owner', 'supervisor', 'cotizador'],
  approveQuotes:           ['owner', 'supervisor'],
  userManagement:         ['owner'],
};

// Orgs where pricing/quoting is entirely unavailable (QGC doesn't quote).
// Hard off: beats role fallback, explicit flags, and the owner auto-grant.
export const QUOTES_DISABLED_ORGS = ['NJBBG5'];
export function orgHasQuotes(userData) {
  return !QUOTES_DISABLED_ORGS.includes(userData?.orgId);
}
// Quoting unlocks for external (non-QGI) orgs on Ultra tier.
// QGI orgs never quote; Pro/lower tiers don't get quoting UI.
export function userCanQuote(userData) {
  return orgHasQuotes(userData)
      && (userData?.tier || '').toLowerCase() === 'ultra';
}
const QUOTE_PERMS = ['managePriceList', 'createQuotes', 'approveQuotes'];

// Check if a role is in a ROLE_FALLBACK list (or is truthy for `true`)
function roleMatches(rule, role) {
  if (rule === true) return true;
  if (Array.isArray(rule)) return rule.includes(role);
  // if rule is a function (like legacy `'owner' === role`), evaluate it
  return typeof rule === 'function' ? rule(role) : false;
}

// Create a _can() checker bound to a specific userData object
// Usage: const _can = makePermChecker(userData); _can('viewDashboard')
export function makePermChecker(userData) {
  const role = userData?.role || userData?.installerRole;
  const perms = userData?.permissions || {};
  const quotesOff = !orgHasQuotes(userData);
  const quotesTierLocked = (userData?.tier || '').toLowerCase() !== 'ultra';
  // Pro tier (external billing): limited dashboard — own measurements only,
  // even for owners. Ultra/QGC get the full dashboard.
  const tier = (userData?.tier || '').toLowerCase();
  const proLimited = tier === 'pro';
  return (permKey) => {
    // QGC-style orgs: no pricing/quoting at all, for anyone.
    // External orgs: quoting requires Ultra tier.
    if (QUOTE_PERMS.includes(permKey) && (quotesOff || quotesTierLocked)) return false;
    // Pro tier: no viewing others' measurements, hard limit.
    if (proLimited && permKey === 'viewOthersMeasurements') return false;
    // explicit permission flag takes priority
    if (perms[permKey] !== undefined) return !!perms[permKey];
    // owners automatically get every permission
    if (role === 'owner') return true;
    // fall back to role-based default
    const fallback = ROLE_FALLBACK[permKey];
    return roleMatches(fallback, role);
  };
}

// canEditJob — checks both ownership and edit permissions
export function canEditJob(job, user, _can) {
  if (!job || !user) return false;
  const isOwn = job.installerUid === user.uid;
  if (isOwn) return _can('editOwnMeasurements');
  return _can('editOthersMeasurements');
}
