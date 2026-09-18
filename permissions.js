// permissions.js — shared permission constants and checker
// Imported by auth-guard.js (index.html) and dashboard.html

export const PERM_DEFS = [
  { key: 'viewDashboard',          label: 'Ver dashboard' },
  { key: 'createMeasurements',     label: 'Crear medidas' },
  { key: 'viewOwnMeasurements',    label: 'Ver mis medidas' },
  { key: 'editOwnMeasurements',    label: 'Editar mis medidas' },
  { key: 'viewOthersMeasurements', label: 'Ver medidas de otros' },
  { key: 'editOthersMeasurements', label: 'Editar medidas de otros' },
  { key: 'userManagement',         label: 'Gestión de usuarios' },
];

const ROLE_FALLBACK = {
  viewDashboard:          true,
  createMeasurements:     ['owner', 'supervisor', 'medidor'],
  viewOwnMeasurements:    true,
  editOwnMeasurements:    ['owner', 'supervisor', 'medidor'],
  viewOthersMeasurements: ['owner', 'supervisor', 'medidor', 'cotizador'],
  editOthersMeasurements: ['owner', 'supervisor'],
  userManagement:         ['owner'],
};

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
  return (permKey) => {
    // explicit permission flag takes priority
    if (perms[permKey] !== undefined) return !!perms[permKey];
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
