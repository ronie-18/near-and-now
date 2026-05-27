import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, WifiOff, CheckCircle, AlertCircle, Loader } from 'lucide-react';

import { apiUrl } from '../utils/apiBase';
const UPDATE_INTERVAL_MS = 5000;

type Status = 'idle' | 'requesting' | 'tracking' | 'error' | 'stopped';

/* ─── Styles ─────────────────────────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Instrument+Sans:wght@300;400;500&display=swap');

  :root {
    --bg:       #0d0f14;
    --surface:  #151820;
    --surface2: #1c2030;
    --border:   #252a3a;
    --text:     #e8eaf2;
    --muted:    #5a6080;
    --green:    #22c55e;
    --green-dim:#16532d;
    --green-glow: rgba(34,197,94,0.18);
    --red:      #ef4444;
    --red-dim:  #4d1414;
    --blue:     #60a5fa;
    --amber:    #f59e0b;
    --radius:   18px;
    --ease:     cubic-bezier(0.22, 1, 0.36, 1);
  }

  .dp-wrap {
    font-family: 'Instrument Sans', sans-serif;
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    color: var(--text);
    position: relative;
    overflow: hidden;
  }

  /* Background orbs */
  .dp-wrap::before, .dp-wrap::after {
    content: '';
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(90px);
    opacity: 0.35;
  }
  .dp-wrap::before {
    width: 500px; height: 500px;
    background: radial-gradient(circle, #22c55e 0%, transparent 70%);
    top: -180px; left: -160px;
  }
  .dp-wrap::after {
    width: 400px; height: 400px;
    background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
    bottom: -160px; right: -120px;
  }

  /* Card */
  .dp-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 440px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 28px;
    padding: 2.25rem;
    box-shadow: 0 40px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset;
    animation: dpIn 0.55s var(--ease) both;
  }

  /* Header */
  .dp-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 2rem;
  }
  .dp-icon-ring {
    position: relative;
    width: 52px; height: 52px;
    flex-shrink: 0;
  }
  .dp-icon-ring svg.dp-ring-svg {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    animation: dpSpin 8s linear infinite;
  }
  .dp-icon-inner {
    position: absolute;
    inset: 8px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 20px var(--green-glow);
  }
  .dp-icon-inner svg { width: 18px; height: 18px; color: #fff; }
  .dp-title {
    font-family: 'Syne', sans-serif;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text);
    margin: 0;
    line-height: 1.1;
  }
  .dp-subtitle {
    font-size: 0.8rem;
    color: var(--muted);
    margin: 3px 0 0;
    font-weight: 300;
  }

  /* Input */
  .dp-field { margin-bottom: 1.5rem; }
  .dp-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .dp-input-wrap { position: relative; }
  .dp-input {
    width: 100%;
    padding: 13px 16px;
    background: var(--surface2);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    font-family: 'Instrument Sans', monospace;
    font-size: 0.875rem;
    color: var(--text);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }
  .dp-input::placeholder { color: var(--muted); }
  .dp-input:focus {
    border-color: var(--green);
    box-shadow: 0 0 0 3px var(--green-glow);
  }
  .dp-input:disabled { opacity: 0.5; cursor: not-allowed; }
  .dp-hint {
    font-size: 0.72rem;
    color: var(--muted);
    margin: 6px 0 0;
  }

  /* Tracking active banner */
  .dp-active-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1.25rem;
    padding: 12px 16px;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: 12px;
    animation: dpIn 0.3s var(--ease);
  }
  .dp-pulse-dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 0 var(--green-glow);
    animation: dpPulse 1.8s ease infinite;
    flex-shrink: 0;
  }
  .dp-active-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--green);
    margin: 0;
  }
  .dp-active-id {
    font-size: 0.72rem;
    color: rgba(34,197,94,0.6);
    font-family: monospace;
    word-break: break-all;
    margin: 2px 0 0;
  }

  /* Location card */
  .dp-location-card {
    margin-bottom: 1.25rem;
    padding: 14px 16px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 12px;
    animation: dpIn 0.3s var(--ease);
  }
  .dp-location-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .dp-location-header svg { width: 13px; height: 13px; color: var(--blue); }
  .dp-location-title {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .dp-coords {
    font-family: monospace;
    font-size: 0.82rem;
    color: var(--text);
    margin: 0 0 4px;
  }
  .dp-location-meta {
    font-size: 0.72rem;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dp-update-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(96,165,250,0.12);
    border: 1px solid rgba(96,165,250,0.2);
    border-radius: 100px;
    padding: 1px 8px;
    font-size: 0.68rem;
    color: var(--blue);
    font-weight: 500;
  }

  /* Status row */
  .dp-status {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
    margin-bottom: 1.25rem;
    min-height: 24px;
  }
  .dp-status svg { width: 15px; height: 15px; flex-shrink: 0; }
  .dp-status.idle    { color: var(--muted); }
  .dp-status.requesting { color: var(--blue); }
  .dp-status.tracking   { color: var(--green); }
  .dp-status.stopped    { color: var(--amber); }
  .dp-status.error      { color: var(--red); }

  /* Error box */
  .dp-error-box {
    margin-bottom: 1.25rem;
    padding: 12px 14px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 10px;
    font-size: 0.82rem;
    color: #fca5a5;
    animation: dpShake 0.35s var(--ease);
  }

  /* Buttons */
  .dp-btn {
    width: 100%;
    padding: 14px;
    border-radius: 14px;
    border: none;
    font-family: 'Syne', sans-serif;
    font-size: 0.92rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  }
  .dp-btn svg { width: 18px; height: 18px; }
  .dp-btn:active:not(:disabled) { transform: scale(0.97); }
  .dp-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .dp-btn-start {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: #fff;
    box-shadow: 0 8px 24px rgba(34,197,94,0.28);
  }
  .dp-btn-start:hover:not(:disabled) {
    box-shadow: 0 12px 32px rgba(34,197,94,0.38);
    transform: translateY(-1px);
  }

  .dp-btn-stop {
    background: rgba(239,68,68,0.12);
    color: var(--red);
    border: 1.5px solid rgba(239,68,68,0.3);
  }
  .dp-btn-stop:hover { background: rgba(239,68,68,0.2); }

  .dp-footer-note {
    text-align: center;
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: 1rem;
    line-height: 1.5;
  }

  /* Divider */
  .dp-sep {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.5rem 0;
  }

  /* Animations */
  @keyframes dpIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dpPulse {
    0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
    70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  @keyframes dpSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes dpShake {
    0%, 100% { transform: translateX(0); }
    25%       { transform: translateX(-5px); }
    75%       { transform: translateX(5px); }
  }
  @keyframes dpSpin2 {
    to { transform: rotate(360deg); }
  }
  .dp-spin { animation: dpSpin2 0.8s linear infinite; }
`;

/* ─── Component ───────────────────────────────────────────────────────── */
const DeliveryPartnerPage = () => {
  const [agentId, setAgentId] = useState('');
  const [inputId, setInputId] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number; ts: string } | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

  /* inject styles */
  useEffect(() => {
    if (document.getElementById('dp-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'dp-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, []);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    intervalRef.current = null;
    watchRef.current = null;
    setStatus('stopped');
  }, []);

  const pushLocation = useCallback(async (pos: GeolocationPosition, id: string) => {
    const { latitude, longitude } = pos.coords;
    try {
      const res = await fetch(apiUrl(`/api/tracking/agents/${id}/location`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setLastLocation({ lat: latitude, lng: longitude, ts: new Date().toLocaleTimeString() });
      setUpdateCount((c) => c + 1);
    } catch (err) {
      console.error('Failed to push location:', err);
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!inputId.trim()) { setErrorMsg('Please enter your Delivery Partner ID.'); return; }
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by this browser.');
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('requesting');
    const id = inputId.trim();
    setAgentId(id);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPos.current = pos;
        setStatus('tracking');
        pushLocation(pos, id);
        watchRef.current = navigator.geolocation.watchPosition(
          (p) => { latestPos.current = p; },
          (err) => console.warn('Watch error:', err),
          { enableHighAccuracy: true, maximumAge: 3000 },
        );
        intervalRef.current = setInterval(() => {
          if (latestPos.current) pushLocation(latestPos.current, id);
        }, UPDATE_INTERVAL_MS);
      },
      (err) => {
        setErrorMsg(`Location access denied: ${err.message}`);
        setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [inputId, pushLocation]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  const isTracking = status === 'tracking';

  return (
    <div className="dp-wrap">
      <div className="dp-card">

        {/* Header */}
        <div className="dp-header">
          <div className="dp-icon-ring">
            <svg className="dp-ring-svg" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke="rgba(34,197,94,0.2)" strokeWidth="1.5" strokeDasharray="4 6" strokeLinecap="round" />
            </svg>
            <div className="dp-icon-inner">
              <Navigation />
            </div>
          </div>
          <div>
            <h1 className="dp-title">Driver Tracker</h1>
            <p className="dp-subtitle">Share your live location with customers</p>
          </div>
        </div>

        {/* ID input */}
        {!isTracking && (
          <div className="dp-field">
            <label className="dp-label" htmlFor="agent-id">Delivery Partner ID</label>
            <div className="dp-input-wrap">
              <input
                id="agent-id"
                type="text"
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startTracking()}
                placeholder="e.g. dp_abc123…"
                className="dp-input"
                disabled={status === 'requesting'}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="dp-hint">Your ID is provided by the admin — paste it above.</p>
          </div>
        )}

        {/* Active banner */}
        {isTracking && (
          <div className="dp-active-banner">
            <span className="dp-pulse-dot" />
            <div>
              <p className="dp-active-label">Live tracking active</p>
              <p className="dp-active-id">ID: {agentId}</p>
            </div>
          </div>
        )}

        {/* Last location */}
        {lastLocation && (
          <div className="dp-location-card">
            <div className="dp-location-header">
              <MapPin />
              <span className="dp-location-title">Last update sent</span>
            </div>
            <p className="dp-coords">
              {lastLocation.lat.toFixed(6)}, {lastLocation.lng.toFixed(6)}
            </p>
            <div className="dp-location-meta">
              <span>{lastLocation.ts}</span>
              <span className="dp-update-badge">{updateCount} push{updateCount !== 1 ? 'es' : ''}</span>
            </div>
          </div>
        )}

        <hr className="dp-sep" />

        {/* Status row */}
        <div className={`dp-status ${status}`}>
          {status === 'idle' && <><WifiOff /> Not tracking</>}
          {status === 'requesting' && <><Loader className="dp-spin" /> Requesting GPS access…</>}
          {status === 'tracking' && <><CheckCircle /> Sending location every {UPDATE_INTERVAL_MS / 1000}s</>}
          {status === 'stopped' && <><WifiOff /> Tracking stopped</>}
          {status === 'error' && <><AlertCircle /> Error</>}
        </div>

        {/* Error box */}
        {errorMsg && <div className="dp-error-box">{errorMsg}</div>}

        {/* CTA button */}
        {!isTracking ? (
          <button
            className="dp-btn dp-btn-start"
            onClick={startTracking}
            disabled={status === 'requesting'}
          >
            {status === 'requesting'
              ? <><Loader className="dp-spin" /> Connecting…</>
              : <><Navigation /> Start Tracking</>}
          </button>
        ) : (
          <button className="dp-btn dp-btn-stop" onClick={stopTracking}>
            <WifiOff /> Stop Tracking
          </button>
        )}

        <p className="dp-footer-note">
          Keep this page open while delivering.<br />GPS updates are sent automatically.
        </p>
      </div>
    </div>
  );
};

export default DeliveryPartnerPage;