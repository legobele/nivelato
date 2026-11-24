export type F = Record<string, string>;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const phoneOk = (v: string) => v.replace(/\D/g, '').length === 10;
const zipOk = (v: string) => /^\d{5}(-\d{4})?$/.test(v);
const intOk = (v: string) => /^\d+$/.test(v) && +v >= 1 && +v <= 100000;
export function validateApply(f: F): Record<string, string> {
  const e: Record<string, string> = {};
  const L = (k: string, n: number, m: string) => { if ((f[k] || '').trim().length < n) e[k] = m; };
  L('legalName', 2, 'Escribe el nombre legal de la empresa.');
  if (!f.bizType) e.bizType = 'Selecciona el tipo de negocio.'; else if (f.bizType === 'other') L('bizTypeOther', 2, 'Especifica el oficio.');
  L('addrStreet', 4, 'Escribe la dirección física.'); L('addrCity', 2, 'Escribe la ciudad o pueblo.');
  if (!zipOk((f.addrZip || '').trim())) e.addrZip = 'Escribe un código postal válido (5 dígitos).';
  L('contactName', 2, 'Escribe tu nombre completo.'); L('contactRole', 2, 'Escribe tu puesto.');
  if (!phoneOk(f.contactPhone || '')) e.contactPhone = 'Escribe un teléfono de 10 dígitos.';
  if (!emailOk((f.contactEmail || '').trim())) e.contactEmail = 'Escribe un correo válido.';
  if (!intOk((f.employees || '').trim())) e.employees = 'Indica el número de empleados.';
  if (!intOk((f.technicians || '').trim())) e.technicians = 'Indica cuántos técnicos usarían Nivelato.';
  L('currentProcess', 10, 'Cuéntanos cómo miden actualmente.');
  if (!f.volume) e.volume = 'Selecciona el volumen.'; if (!f.tier) e.tier = 'Selecciona un plan.';
  if (!f.timeline) e.timeline = 'Selecciona un plazo.'; if (!f.hearAbout) e.hearAbout = 'Selecciona una opción.';
  return e;
}

