import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plane, RefreshCw, MapPin } from 'lucide-react';

/**
 * Live airborne sample via OpenSky (when CORS allows).
 * Falls back to last-known style sample so the UI never breaks.
 */
const FALLBACK = [
  { callsign: 'UAL442', origin_country: 'United States', baro_altitude: 10668, velocity: 240, true_track: 85, lat: 39.5, lon: -98.3 },
  { callsign: 'BAW178', origin_country: 'United Kingdom', baro_altitude: 11200, velocity: 250, true_track: 270, lat: 51.2, lon: -5.1 },
  { callsign: 'AAL100', origin_country: 'United States', baro_altitude: 9753, velocity: 230, true_track: 45, lat: 40.1, lon: -74.2 },
  { callsign: 'DAL421', origin_country: 'United States', baro_altitude: 10058, velocity: 235, true_track: 180, lat: 33.6, lon: -84.4 },
];

function fmtAlt(m) {
  if (m == null) return '—';
  return `${Math.round(m * 3.28084).toLocaleString()} ft`;
}
function fmtSpd(ms) {
  if (ms == null) return '—';
  return `${Math.round(ms * 1.94384)} kt`;
}

export default function DiscoverFlights() {
  const [flights, setFlights] = useState([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      // Bounding box roughly CONUS for a manageable sample
      const url =
        'https://opensky-network.org/api/states/all?lamin=24.5&lomin=-125&lamax=49.5&lomax=-66.5';
      const res = await fetch(url);
      if (!res.ok) throw new Error('OpenSky unavailable');
      const data = await res.json();
      const rows = (data.states || [])
        .filter((s) => s[1] && s[1].trim())
        .slice(0, 12)
        .map((s) => ({
          callsign: String(s[1]).trim(),
          origin_country: s[2],
          baro_altitude: s[7],
          velocity: s[9],
          true_track: s[10],
          lat: s[6],
          lon: s[5],
        }));
      if (!rows.length) throw new Error('No airborne sample');
      setFlights(rows);
      setSource('OpenSky Network · live ADS-B sample (CONUS window)');
    } catch (e) {
      setFlights(FALLBACK);
      setSource('Live feed unavailable in this browser');
      setError(e.message || 'Using offline sample');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F6F9] pb-28">
      <div className="sticky top-0 z-10 bg-white/95 border-b border-slate-200 px-4 py-3 flex items-center gap-3 backdrop-blur-md">
        <Link to="/discover" className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-navy">Flight tracking</h1>
          <p className="text-[10px] text-slate-500 font-mono truncate">{source || '…'}</p>
        </div>
        <button type="button" onClick={load} className="p-2 rounded-full hover:bg-slate-100" aria-label="Refresh">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="relative h-40 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy to-transparent" />
        <div className="absolute bottom-4 left-5 text-white">
          <p className="font-mono text-[10px] text-brass uppercase tracking-wider">Air traffic</p>
          <p className="font-heading font-bold text-xl">Live positions</p>
        </div>
      </div>

      <div className="p-4">
        {error && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-50 overflow-hidden">
          {loading && !flights.length ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
            </div>
          ) : (
            flights.map((f) => (
              <div key={f.callsign + String(f.lat)} className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center">
                  <Plane size={18} className="text-brass" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-navy">{f.callsign}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin size={10} /> {f.origin_country}
                    {f.lat != null && (
                      <span className="font-mono text-slate-400">
                        · {Number(f.lat).toFixed(2)}, {Number(f.lon).toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-600">
                  <p>{fmtAlt(f.baro_altitude)}</p>
                  <p>{fmtSpd(f.velocity)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          Tracking is informational. OpenSky data is typically for non-commercial research; commercial products
          need licensed providers. Booking remains behind membership activation.
        </p>
      </div>
    </div>
  );
}
