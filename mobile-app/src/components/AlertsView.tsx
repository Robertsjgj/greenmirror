import React from 'react';

interface ZoneReading {
  zone_id: string;
  node_id?: string;
  soil_moisture_pct: number;
  soil_temp_c: number | null;
  alerts: string[];
}

interface LatestReading {
  node_id?: string;
  greenhouse_id: string;
  node_count?: number;
  zone_count?: number;
  zones: ZoneReading[];
  timestamp?: string;
}

interface AlertsViewProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
}

export function AlertsView({ latestReading, loading, error }: AlertsViewProps) {
  const zones = latestReading?.zones ?? [];
  const hasZones = zones.length > 0;

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-stone-800">GreenMirror Alerts</h2>
            <p className="text-sm text-stone-500 mt-1">
              {loading
                ? 'Loading latest sensor readings...'
                : error
                ? 'Backend is offline or unreachable.'
                : hasZones
                ? `${zones.length} zone${zones.length !== 1 ? 's' : ''} reporting live data.`
                : 'No data yet'}
            </p>
          </div>
          <div className="text-xs font-semibold text-stone-500">
            {latestReading?.timestamp
              ? new Date(latestReading.timestamp).toLocaleTimeString()
              : 'No timestamp'}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {`Error: ${error}`}
          </div>
        )}
      </div>

      {!loading && !error && !hasZones && (
        <div className="rounded-3xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
          No data yet
        </div>
      )}

      <div className="max-h-[31rem] space-y-4 overflow-y-auto pr-1">
        {zones.map((zone) => (
          <div
            key={`${zone.node_id ?? 'node'}-${zone.zone_id}`}
            className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-800 break-words">{zone.zone_id}</h3>
                <p className="text-sm text-stone-500">
                  {zone.node_id ? zone.node_id : 'Live zone data from backend'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                  Moisture {zone.soil_moisture_pct}%
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  Temp {zone.soil_temp_c !== null ? `${zone.soil_temp_c.toFixed(1)}°C` : 'Sensor not detected'}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-stone-600 font-semibold">Alerts</p>
              {zone.alerts.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-stone-700">
                  {zone.alerts.map((alert, index) => (
                    <li
                      key={`${zone.zone_id}-alert-${index}`}
                      className="rounded-2xl bg-rose-50 px-3 py-2 text-rose-700">
                      {alert}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-emerald-700">No alerts for this zone.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
