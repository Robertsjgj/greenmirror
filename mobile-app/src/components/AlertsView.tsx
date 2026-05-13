interface ZoneReading {
  zone_id: string;
  node_id?: string;
  soil_moisture_pct: number | null;
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
  const alertCount = zones.reduce((count, zone) => count + zone.alerts.length, 0);

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-[1.35rem] border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-stone-900">Alerts</h2>
            <p className="mt-0.5 text-sm font-bold text-stone-500">
              {loading
                ? 'Loading latest sensor readings...'
                : error
                ? 'Backend is offline or unreachable.'
                : hasZones
                ? `${alertCount} active alert${alertCount !== 1 ? 's' : ''} across ${zones.length} zone${zones.length !== 1 ? 's' : ''}.`
                : 'No data yet'}
            </p>
          </div>
          <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-extrabold text-stone-500">
            {latestReading?.timestamp ? new Date(latestReading.timestamp).toLocaleTimeString() : 'No timestamp'}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {`Error: ${error}`}
          </div>
        )}
      </div>

      {!loading && !error && !hasZones && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
          No data yet
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {zones.map((zone) => {
          const hasAlerts = zone.alerts.length > 0;

          return (
            <div
              key={`${zone.node_id ?? 'node'}-${zone.zone_id}`}
              className="rounded-[1.35rem] border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-stone-900">{zone.zone_id}</h3>
                  <p className="text-sm font-bold text-stone-500">
                    {zone.node_id ? zone.node_id : 'Live zone data from backend'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                    hasAlerts ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {hasAlerts ? `${zone.alerts.length} alert${zone.alerts.length !== 1 ? 's' : ''}` : 'Clear'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-extrabold">
                <span className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                  Moisture {zone.soil_moisture_pct !== null ? `${zone.soil_moisture_pct}%` : '--'}
                </span>
                <span className="rounded-2xl bg-sky-50 px-3 py-2 text-sky-700">
                  Temp {zone.soil_temp_c !== null ? `${zone.soil_temp_c.toFixed(1)}C` : '--'}
                </span>
              </div>

              <div className="mt-3 grid gap-2">
                {hasAlerts ? (
                  zone.alerts.map((alert, index) => (
                    <p key={`${zone.zone_id}-alert-${index}`} className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                      {alert}
                    </p>
                  ))
                ) : (
                  <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                    No alerts for this zone.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
