/* Port of permissions.js (PERM_DEFS, ROLE_FALLBACK, makePermChecker, canEditJob). Same rules. */
export interface UserData { uid?: string; name?: string; role?: string; installerRole?: string; tier?: string; orgId?: string; permissions?: Record<string, boolean> }
export const PERM_KEYS = ['viewDashboard', 'createMeasurements', 'viewOwnMeasurements', 'editOwnMeasurements', 'viewOthersMeasurements', 'editOthersMeasurements', 'managePriceList', 'createQuotes', 'approveQuotes', 'userManagement'] as const;
export type PermKey = (typeof PERM_KEYS)[number];
const ROLE_FALLBACK: Record<PermKey, true | string[]> = {
  viewDashboard: true, createMeasurements: ['owner', 'supervisor', 'medidor'], viewOwnMeasurements: true,
  editOwnMeasurements: ['owner', 'supervisor', 'medidor'], viewOthersMeasurements: ['owner', 'supervisor', 'medidor', 'cotizador'],
  editOthersMeasurements: ['owner', 'supervisor'], managePriceList: ['owner', 'supervisor'], createQuotes: ['owner', 'supervisor', 'cotizador'],
  approveQuotes: ['owner', 'supervisor'], userManagement: ['owner'],
};
export const QUOTES_DISABLED_ORGS = ['NJBBG5'];
const QUOTE_PERMS: PermKey[] = ['managePriceList', 'createQuotes', 'approveQuotes'];
export const orgHasQuotes = (u?: UserData) => !QUOTES_DISABLED_ORGS.includes(u?.orgId ?? '');
export function makePermChecker(u?: UserData) {
  const role = u?.role || u?.installerRole; const perms = u?.permissions || {};
  const quotesOff = !orgHasQuotes(u); const tier = (u?.tier || '').toLowerCase();
  return (k: PermKey): boolean => {
    if (QUOTE_PERMS.includes(k) && (quotesOff || tier !== 'ultra')) return false;
    if (tier === 'pro' && k === 'viewOthersMeasurements') return false;
    if (perms[k] !== undefined) return !!perms[k];
    if (role === 'owner') return true;
    const f = ROLE_FALLBACK[k]; return f === true ? true : Array.isArray(f) ? f.includes(role as string) : false;
  };
}
export function canEditJob(job: { installerUid?: string }, u: UserData, can: (k: PermKey) => boolean) {
  return job.installerUid === u.uid ? can('editOwnMeasurements') : can('editOthersMeasurements');
}
