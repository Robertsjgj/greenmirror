import React, { useState, useEffect } from 'react';
import { PlantCare } from './components/PlantCare';
import { EnvironmentView } from './components/EnvironmentView';
import { AlertsView } from './components/AlertsView';
import { SimpleRunoff } from './components/SimpleRunoff';
import { GreenhouseView } from './components/GreenhouseView';
import { motion, AnimatePresence } from 'framer-motion';
import { Sprout, Sun, Bell, Droplets, Map } from 'lucide-react';

type Tab = 'plants' | 'greenhouse' | 'environment' | 'alerts' | 'runoff';

interface ZoneReading {
  zone_id: string;
  soil_moisture_pct: number;
  soil_temp_c: number | null;
  alerts: string[];
}

interface LatestReading {
  node_id: string;
  greenhouse_id: string;
  zones: ZoneReading[];
  timestamp?: string;
}
export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('plants');
  const [latestReading, setLatestReading] = useState<LatestReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const API_URL = 'http://192.168.7.202:5000/api/latest';

  const fetchLatestReading = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      setLatestReading(data?.zones?.length ? data : null);
      setError(null);
    } catch (fetchError: any) {
      setLatestReading(null);
      setError(fetchError?.message || 'Unable to fetch latest reading');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestReading();
    const interval = setInterval(fetchLatestReading, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    console.log('Latest Reading:', latestReading);
  }, [latestReading]);

  return (
    <div className="min-h-screen bg-stone-200 flex items-start justify-center">
      {/* Mobile Phone Frame */}
      <div className="w-full max-w-[430px] min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 pb-20 relative shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="bg-stone-50/80 backdrop-blur-md sticky top-0 z-50 pt-4 pb-2 px-4">
          <div className="flex items-center justify-between">
            {/* Greeting */}
            <div>
              <h1 className="text-xl font-extrabold text-stone-800 tracking-tight">
                Good morning! 🌞
              </h1>
              <p className="text-sm font-bold text-emerald-600">
                GreenMirror Garden
              </p>
            </div>

            {/* Avatar */}
            <div className="h-10 w-10 rounded-full bg-emerald-100 border-2 border-white shadow-sm flex items-center justify-center text-xl">
              🧑‍🌾
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-4 py-4 h-full overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{
                opacity: 0,
                x: 10
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              exit={{
                opacity: 0,
                x: -10
              }}
              transition={{
                duration: 0.2
              }}>
              
              {activeTab === 'plants' && (
                <PlantCare
                  latestReading={latestReading}
                  loading={loading}
                  error={error}
                />
              )}
              {activeTab === 'greenhouse' && (
                <GreenhouseView
                  latestReading={latestReading}
                  loading={loading}
                  error={error}
                />
              )}
              {activeTab === 'environment' && <EnvironmentView />}
              {activeTab === 'alerts' && (
                <AlertsView
                  latestReading={latestReading}
                  loading={loading}
                  error={error}
                />
              )}
              {activeTab === 'runoff' && <SimpleRunoff />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-stone-200 z-50 rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex justify-around items-center h-[72px] px-1 pb-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300">
                  
                  <div
                    className={`
                    p-2 rounded-xl transition-colors duration-300 mb-0.5
                    ${isActive ? 'bg-emerald-100 text-emerald-600' : 'text-stone-400'}
                  `}>
                    
                    <Icon
                      className="w-5 h-5"
                      strokeWidth={isActive ? 2.5 : 2} />
                    
                  </div>
                  <span
                    className={`
                    text-[10px] font-bold transition-colors duration-300
                    ${isActive ? 'text-emerald-700' : 'text-stone-500'}
                  `}>
                    
                    {tab.label}
                  </span>
                  {isActive &&
                  <motion.div
                    layoutId="activeMobileTab"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />

                  }
                </button>);

            })}
          </div>
        </nav>
      </div>
    </div>);

}
