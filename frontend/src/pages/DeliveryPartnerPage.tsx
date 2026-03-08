import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, WifiOff, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const UPDATE_INTERVAL_MS = 5000;

type Status = 'idle' | 'requesting' | 'tracking' | 'error' | 'stopped';

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
      const res = await fetch(`${API_URL}/api/tracking/agents/${id}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude })
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setLastLocation({ lat: latitude, lng: longitude, ts: new Date().toLocaleTimeString() });
      setUpdateCount((c) => c + 1);
    } catch (err: any) {
      console.error('Failed to push location:', err);
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!inputId.trim()) {
      setErrorMsg('Please enter your Delivery Partner ID.');
      return;
    }

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

        // Watch position continuously
        watchRef.current = navigator.geolocation.watchPosition(
          (p) => { latestPos.current = p; },
          (err) => console.warn('Watch error:', err),
          { enableHighAccuracy: true, maximumAge: 3000 }
        );

        // Push to backend every UPDATE_INTERVAL_MS
        intervalRef.current = setInterval(() => {
          if (latestPos.current) pushLocation(latestPos.current, id);
        }, UPDATE_INTERVAL_MS);
      },
      (err) => {
        setErrorMsg(`Location access denied: ${err.message}`);
        setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [inputId, pushLocation]);

  // Cleanup on unmount
  useEffect(() => () => stopTracking(), [stopTracking]);

  const isTracking = status === 'tracking';

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Driver Tracker</h1>
              <p className="text-sm text-gray-500">Share your live location with customers</p>
            </div>
          </div>

          {/* Agent ID input */}
          {!isTracking && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Your Delivery Partner ID
              </label>
              <input
                type="text"
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                placeholder="e.g. dp_abc123..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 transition-colors font-mono text-sm"
                disabled={status === 'requesting'}
              />
              <p className="text-xs text-gray-400 mt-1">
                Your ID is provided by the admin. Paste it above.
              </p>
            </div>
          )}

          {/* Active tracking info */}
          {isTracking && (
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="font-semibold text-green-800">Live tracking active</p>
              </div>
              <p className="text-xs text-green-600 font-mono break-all">ID: {agentId}</p>
            </div>
          )}

          {/* Last location card */}
          {lastLocation && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Last update sent</span>
              </div>
              <p className="text-xs text-blue-700 font-mono">
                {lastLocation.lat.toFixed(6)}, {lastLocation.lng.toFixed(6)}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                At {lastLocation.ts} &bull; {updateCount} update{updateCount !== 1 ? 's' : ''} sent
              </p>
            </div>
          )}

          {/* Status badges */}
          <div className="flex items-center gap-2 mb-6">
            {status === 'idle' && (
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <WifiOff className="w-4 h-4" /> Not tracking
              </span>
            )}
            {status === 'requesting' && (
              <span className="text-sm text-blue-600 flex items-center gap-1">
                <Loader className="w-4 h-4 animate-spin" /> Requesting GPS access…
              </span>
            )}
            {status === 'tracking' && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Sending location every {UPDATE_INTERVAL_MS / 1000}s
              </span>
            )}
            {status === 'stopped' && (
              <span className="text-sm text-orange-500 flex items-center gap-1">
                <WifiOff className="w-4 h-4" /> Tracking stopped
              </span>
            )}
            {status === 'error' && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Error
              </span>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Action buttons */}
          {!isTracking ? (
            <button
              onClick={startTracking}
              disabled={status === 'requesting'}
              className="w-full py-3.5 bg-gradient-to-r from-green-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'requesting' ? (
                <><Loader className="w-5 h-5 animate-spin" /> Connecting…</>
              ) : (
                <><Navigation className="w-5 h-5" /> Start Tracking</>
              )}
            </button>
          ) : (
            <button
              onClick={stopTracking}
              className="w-full py-3.5 bg-red-500 text-white font-bold rounded-xl shadow-lg hover:bg-red-600 transition-all flex items-center justify-center gap-2"
            >
              <WifiOff className="w-5 h-5" /> Stop Tracking
            </button>
          )}

          <p className="text-center text-xs text-gray-400 mt-4">
            Keep this page open while delivering. GPS updates are sent automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeliveryPartnerPage;
