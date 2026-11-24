export interface QrStatus { status: 'none' | 'pending' | 'used' | 'expired' | 'superseded' | 'revoked'; createdAt?: string | number; expiresAt?: string | number }
export interface QrToken { url: string; qrSvg?: string; createdAt: string | number; expiresAt?: string | number }
export type QrView = 'none' | 'ours' | 'elsewhere' | 'spent';
/** Mirrors legacy check(): minting is never automatic; a live token this browser does not hold is never replaced silently. */
export function qrView(st: QrStatus | null | undefined, stored: QrToken | null): QrView {
  if (!st || st.status === 'none') return 'none';
  if (st.status === 'pending') {
    const ours = !!(stored && stored.qrSvg && st.createdAt && stored.createdAt && new Date(st.createdAt).getTime() === new Date(stored.createdAt).getTime());
    return ours ? 'ours' : 'elsewhere';
  }
  return 'spent';
}
