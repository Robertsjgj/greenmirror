import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Droplets, Map, Sprout, Sun, Wifi, WifiOff } from 'lucide-react';
import { AlertsView } from './components/AlertsView';
import { EnvironmentView } from './components/EnvironmentView';
import { GreenhouseView } from './components/GreenhouseView';
import { PlantCare } from './components/PlantCare';
import { SimpleRunoff } from './components/SimpleRunoff';
import { LATEST_READING_URL } from './config';

type Tab = 'plants' | 'greenhouse' | 'environment' | 'alerts' | 'runoff';

interface ZoneReading {
  zone_id: string;
  node_id?: string;
  greenhouse_id?: string;
  soil_moisture_raw?: number | null;
  soil_moisture_pct: number | null;
  soil_temp_c: number | null;
  soil_temp_status?: string | null;
  alerts: string[];
}

interface LatestReading {
  mode?: string;
  node_id?: string;
  greenhouse_id: string;
  node_count?: number;
  zone_count?: number;
  zones: ZoneReading[];
  timestamp?: string;
}

const tabs = [
  {
    id: 'plants',
    label: 'Plants',
    icon: Sprout
  },
  {
    id: 'greenhouse',
    label: 'Map',
    icon: Map
  },
  {
    id: 'environment',
    label: 'Weather',
    icon: Sun
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: Bell
  },
  {
    id: 'runoff',
    label: 'Runoff',
    icon: Droplets
  }
] as const;

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('plants');
  const [latestReading, setLatestReading] = useState<LatestReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLatestReading = async () => {
    setLoading(true);
    try {
      const response = await fetch(LATEST_READING_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      setLatestReading(data?.zones?.length ? data : null);
      setError(null);
    } catch (fetchError: unknown) {
      setLatestReading(null);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch latest reading');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestReading();
    const interval = setInterval(fetchLatestReading, 8000);
    return () => clearInterval(interval);
  }, []);

  const online = !error && Boolean(latestReading);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 selection:bg-emerald-100 selection:text-emerald-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col bg-stone-50 shadow-none lg:border-x lg:border-stone-200 lg:shadow-2xl">
        <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-stone-50/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">GreenMirror</p>
              <h1 className="truncate text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">
                Garden Control
              </h1>
            </div>

            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${
                online
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : error
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-stone-200 bg-white text-stone-500'
              }`}
            >
              {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <span>{online ? 'Live' : loading ? 'Syncing' : 'Offline'}</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'plants' && (
                <PlantCare latestReading={latestReading} loading={loading} error={error} />
              )}
              {activeTab === 'greenhouse' && (
                <GreenhouseView latestReading={latestReading} loading={loading} error={error} />
              )}
              {activeTab === 'environment' && <EnvironmentView />}
              {activeTab === 'alerts' && (
                <AlertsView latestReading={latestReading} loading={loading} error={error} />
              )}
              {activeTab === 'runoff' && <SimpleRunoff />}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(41,37,36,0.08)] backdrop-blur-xl lg:absolute">
          <div className="mx-auto grid h-[72px] max-w-2xl grid-cols-5 items-center gap-1 px-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex h-14 min-w-0 flex-col items-center justify-center rounded-2xl transition-all duration-200 ${
                    isActive ? 'text-emerald-700' : 'text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  <div
                    className={`mb-0.5 rounded-xl p-2 transition-colors duration-200 ${
                      isActive ? 'bg-emerald-100 text-emerald-600' : 'text-stone-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="truncate text-[10px] font-bold">{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeMobileTab"
                      className="absolute -top-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-emerald-500"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
