import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../utils/apiBase';
import { authedFetch, getAuthHeaders } from '../utils/authHeader';

/**
 * Live GSTIN check against the GST registry (POST /api/gstin/verify), run once
 * the typed GSTIN passes the offline check. 2026-10-02.
 *
 *  - verified     Active on the GST portal; `legalName` is the registered name.
 *  - rejected     cancelled / suspended / not registered — `message` says why.
 *  - unavailable  couldn't check right now (provider down, not configured,
 *                 rate-limited, offline). Never blocks the customer: the order
 *                 is re-checked by the backend when it's placed.
 */
export type GstinCheck =
  | { state: 'idle' | 'checking' | 'unavailable' }
  | { state: 'verified'; legalName: string; tradeName: string }
  | { state: 'rejected'; message: string };

const DEBOUNCE_MS = 500;

export function useGstinVerification(gstin: string, enabled: boolean): GstinCheck {
  const [check, setCheck] = useState<GstinCheck>({ state: 'idle' });
  // Only the newest request may commit — the customer can keep typing while
  // an older lookup is in flight.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!enabled) {
      setCheck({ state: 'idle' });
      return;
    }
    setCheck({ state: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const res = await authedFetch(apiUrl('/api/gstin/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ gstin }),
        });
        const data = await res.json().catch(() => null);
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || !data?.success) {
          setCheck({ state: 'unavailable' });
        } else if (data.result === 'active') {
          setCheck({ state: 'verified', legalName: data.legal_name || '', tradeName: data.trade_name || '' });
        } else if (data.message) {
          setCheck({ state: 'rejected', message: data.message });
        } else {
          setCheck({ state: 'unavailable' });
        }
      } catch {
        if (requestId === requestIdRef.current) setCheck({ state: 'unavailable' });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [gstin, enabled]);

  return check;
}
