import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Thermometer,
  AlertTriangle,
  Info,
  Play,
  RefreshCw,
  CloudRain,
  Sprout,
  TrendingDown,
  Clock } from
'lucide-react';
// Types
type ZoneStatus = 'healthy' | 'caution' | 'alert';
type GreenhouseType = 'covered' | 'open';
interface Zone {
  id: number;
  moisture: number;
  risk: number;
  temp: number;
  status: ZoneStatus;
}
interface SimulationResult {
  predictedRisk: number;
  affectedZones: number[];
  waterLoss: number;
  timeToSaturation: number;
}
// Mock Data Generator
const generateZones = (
isSimulation: boolean,
rainIntensity: number,
irrigationVolume: number,
greenhouseType: GreenhouseType)
: Zone[] => {
  return Array.from(
    {
      length: 12
    },
    (_, i) => {
      let moisture = 30 + Math.random() * 20;
      let risk = Math.random() * 30;
      if (isSimulation) {
        if (greenhouseType === 'open') {
          moisture += rainIntensity * 0.8;
          risk += rainIntensity * 0.6;
        } else {
          // Covered greenhouse: irrigation-based
          moisture += irrigationVolume * 0.5;
          risk += irrigationVolume * 0.4;
        }
        // Zones near "drainage" (bottom row) get higher risk
        if (i >= 8) risk += 20;
      }
      let status: ZoneStatus = 'healthy';
      if (risk > 70) status = 'alert';else
      if (risk > 40) status = 'caution';
      return {
        id: i + 1,
        moisture: Math.min(100, Math.round(moisture)),
        risk: Math.min(100, Math.round(risk)),
        temp: 22 + Math.random() * 4,
        status
      };
    }
  );
};
export function DigitalTwin() {
  const [mode, setMode] = useState<'realtime' | 'simulation'>('realtime');
  const [greenhouseType, setGreenhouseType] = useState<GreenhouseType>('open');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  // Open greenhouse controls
  const [rainIntensity, setRainIntensity] = useState(50);
  // Covered greenhouse controls
  const [irrigationVolume, setIrrigationVolume] = useState(5);
  const [irrigationDuration, setIrrigationDuration] = useState(15);
  const [soilSaturation, setSoilSaturation] = useState(45);
  // Simulation results
  const [simulationResult, setSimulationResult] =
  useState<SimulationResult | null>(null);
  const zones = generateZones(
    mode === 'simulation',
    rainIntensity,
    irrigationVolume,
    greenhouseType
  );
  const getZoneColor = (status: ZoneStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30';
      case 'caution':
        return 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30';
      case 'alert':
        return 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30';
      default:
        return 'bg-slate-100 border-slate-200';
    }
  };
  const runSimulation = () => {
    // Mock simulation calculation
    const affectedZones = zones.filter((z) => z.risk > 40).map((z) => z.id);
    const avgRisk = zones.reduce((sum, z) => sum + z.risk, 0) / zones.length;
    setSimulationResult({
      predictedRisk: Math.round(avgRisk),
      affectedZones,
      waterLoss:
      greenhouseType === 'open' ?
      Math.round(rainIntensity * 2.5) :
      Math.round(irrigationVolume * irrigationDuration * 0.3),
      timeToSaturation:
      greenhouseType === 'open' ?
      Math.round(120 - rainIntensity * 0.8) :
      Math.round(180 - irrigationVolume * 10)
    });
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 h-full">
      {/* Main Map Area */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex bg-slate-100 p-1 rounded-md w-full sm:w-auto">
            <button
              onClick={() => setMode('realtime')}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-sm transition-all ${mode === 'realtime' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              
              Real-time
            </button>
            <button
              onClick={() => setMode('simulation')}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-sm transition-all ${mode === 'simulation' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              
              Simulation
            </button>
          </div>

          <div className="flex gap-2 sm:gap-3 text-[10px] sm:text-xs font-medium text-slate-500 justify-center sm:justify-start">
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>
              Low
            </span>
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
              Med
            </span>
            <span className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-red-500 mr-1"></span>
              High
            </span>
          </div>
        </div>

        <Card className="relative min-h-[300px] sm:min-h-[400px] flex items-center justify-center bg-slate-50 border-slate-200 p-4 sm:p-8">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-4 w-full max-w-2xl aspect-[3/4] sm:aspect-[4/3]">
            {zones.map((zone) =>
            <motion.button
              key={zone.id}
              layoutId={`zone-${zone.id}`}
              onClick={() => setSelectedZone(zone)}
              className={`
                  relative rounded-sm border-2 transition-colors duration-500 flex flex-col items-center justify-center min-h-[60px] sm:min-h-0
                  ${getZoneColor(zone.status)}
                  ${selectedZone?.id === zone.id ? 'ring-2 ring-slate-900 ring-offset-2' : ''}
                `}
              whileHover={{
                scale: 1.02
              }}
              whileTap={{
                scale: 0.95
              }}>
              
                <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-600/70">
                  Z-{zone.id}
                </span>
                {mode === 'simulation' &&
              <span className="text-[8px] sm:text-[10px] font-medium mt-1 text-slate-500">
                    {zone.risk}%
                  </span>
              }
              </motion.button>
            )}
          </div>

          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-white/90 backdrop-blur-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded-sm border border-slate-200 text-[10px] sm:text-xs font-mono text-slate-500">
            GREENHOUSE A
          </div>
        </Card>

        {/* Simulation Results */}
        <AnimatePresence>
          {simulationResult && mode === 'simulation' &&
          <motion.div
            initial={{
              opacity: 0,
              height: 0
            }}
            animate={{
              opacity: 1,
              height: 'auto'
            }}
            exit={{
              opacity: 0,
              height: 0
            }}>
            
              <Card
              title="Simulation Results"
              className="border-indigo-100 bg-indigo-50/30">
              
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div className="p-3 bg-white rounded-sm border border-indigo-100">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">
                        Avg Risk
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">
                      {simulationResult.predictedRisk}%
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-sm border border-indigo-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Sprout className="w-3 h-3 text-red-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">
                        Affected
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">
                      {simulationResult.affectedZones.length}
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-sm border border-indigo-100">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-3 h-3 text-blue-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">
                        Loss
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">
                      {simulationResult.waterLoss}L
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-sm border border-indigo-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase">
                        Time
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900">
                      {simulationResult.timeToSaturation}m
                    </p>
                  </div>
                </div>
                {simulationResult.affectedZones.length > 0 &&
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-sm">
                    <p className="text-xs font-medium text-amber-900 mb-1">
                      High Risk Zones
                    </p>
                    <p className="text-xs text-amber-700">
                      Zones {simulationResult.affectedZones.join(', ')} require
                      attention
                    </p>
                  </div>
              }
              </Card>
            </motion.div>
          }
        </AnimatePresence>
      </div>

      {/* Sidebar Controls */}
      <div className="space-y-4 lg:space-y-6">
        <AnimatePresence mode="wait">
          {mode === 'simulation' ?
          <motion.div
            key="sim-controls"
            initial={{
              opacity: 0,
              y: 10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            exit={{
              opacity: 0,
              y: -10
            }}>
            
              <Card
              title="Simulation Controls"
              className="border-indigo-100 bg-indigo-50/30">
              
                <div className="space-y-4 sm:space-y-6">
                  {/* Greenhouse Type Toggle */}
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-700 mb-2 block">
                      Greenhouse Type
                    </label>
                    <div className="flex bg-white p-1 rounded-sm border border-slate-200">
                      <button
                      onClick={() => setGreenhouseType('open')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-sm transition-colors ${greenhouseType === 'open' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
                      
                        <CloudRain className="w-3 h-3" />
                        Open
                      </button>
                      <button
                      onClick={() => setGreenhouseType('covered')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-sm transition-colors ${greenhouseType === 'covered' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
                      
                        <Sprout className="w-3 h-3" />
                        Covered
                      </button>
                    </div>
                  </div>

                  {/* Conditional Controls */}
                  <AnimatePresence mode="wait">
                    {greenhouseType === 'open' ?
                  <motion.div
                    key="open-controls"
                    initial={{
                      opacity: 0
                    }}
                    animate={{
                      opacity: 1
                    }}
                    exit={{
                      opacity: 0
                    }}>
                    
                        <div className="flex justify-between mb-2">
                          <label className="text-xs sm:text-sm font-medium text-slate-700">
                            Rainfall Intensity
                          </label>
                          <span className="text-xs sm:text-sm font-mono text-indigo-600">
                            {rainIntensity}mm/h
                          </span>
                        </div>
                        <input
                      type="range"
                      min="0"
                      max="100"
                      value={rainIntensity}
                      onChange={(e) =>
                      setRainIntensity(Number(e.target.value))
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                    
                        <div className="flex justify-between mt-1 text-xs text-slate-400">
                          <span>Dry</span>
                          <span>Storm</span>
                        </div>
                      </motion.div> :

                  <motion.div
                    key="covered-controls"
                    initial={{
                      opacity: 0
                    }}
                    animate={{
                      opacity: 1
                    }}
                    exit={{
                      opacity: 0
                    }}
                    className="space-y-4">
                    
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="text-xs sm:text-sm font-medium text-slate-700">
                              Irrigation Volume
                            </label>
                            <span className="text-xs sm:text-sm font-mono text-indigo-600">
                              {irrigationVolume}L/min
                            </span>
                          </div>
                          <input
                        type="range"
                        min="0"
                        max="20"
                        value={irrigationVolume}
                        onChange={(e) =>
                        setIrrigationVolume(Number(e.target.value))
                        }
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                      
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="text-xs sm:text-sm font-medium text-slate-700">
                              Duration
                            </label>
                            <span className="text-xs sm:text-sm font-mono text-indigo-600">
                              {irrigationDuration}min
                            </span>
                          </div>
                          <input
                        type="range"
                        min="5"
                        max="60"
                        value={irrigationDuration}
                        onChange={(e) =>
                        setIrrigationDuration(Number(e.target.value))
                        }
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                      
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="text-xs sm:text-sm font-medium text-slate-700">
                              Current Soil Saturation
                            </label>
                            <span className="text-xs sm:text-sm font-mono text-indigo-600">
                              {soilSaturation}%
                            </span>
                          </div>
                          <input
                        type="range"
                        min="0"
                        max="100"
                        value={soilSaturation}
                        onChange={(e) =>
                        setSoilSaturation(Number(e.target.value))
                        }
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                      
                        </div>
                      </motion.div>
                  }
                  </AnimatePresence>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                    size="sm"
                    variant="primary"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 justify-center"
                    icon={<Play className="w-3 h-3" />}
                    onClick={runSimulation}>
                    
                      Run Scenario
                    </Button>
                    <Button
                    size="sm"
                    variant="outline"
                    className="sm:w-auto justify-center"
                    icon={<RefreshCw className="w-3 h-3" />}
                    onClick={() => setSimulationResult(null)}>
                    
                      Reset
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div> :

          <motion.div
            key="realtime-status"
            initial={{
              opacity: 0,
              y: 10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            exit={{
              opacity: 0,
              y: -10
            }}>
            
              <Card title="System Status">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-sm border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-full">
                        <RefreshCw className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-emerald-900">
                          Sensors Active
                        </p>
                        <p className="text-[10px] sm:text-xs text-emerald-600">
                          All 12 zones reporting
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Real-time data is streaming from the sensor network. Updates
                    occur every 30 seconds.
                  </p>
                </div>
              </Card>
            </motion.div>
          }
        </AnimatePresence>

        {/* Zone Details */}
        <AnimatePresence mode="wait">
          {selectedZone ?
          <motion.div
            key={selectedZone.id}
            initial={{
              opacity: 0,
              scale: 0.95
            }}
            animate={{
              opacity: 1,
              scale: 1
            }}
            exit={{
              opacity: 0,
              scale: 0.95
            }}>
            
              <Card title={`Zone ${selectedZone.id} Details`}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="p-3 bg-slate-50 rounded-sm border border-slate-100">
                      <div className="flex items-center gap-2 mb-1 text-slate-500">
                        <Droplets className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase">
                          Moisture
                        </span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-slate-900">
                        {selectedZone.moisture}%
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-sm border border-slate-100">
                      <div className="flex items-center gap-2 mb-1 text-slate-500">
                        <Thermometer className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="text-[10px] sm:text-xs font-medium uppercase">
                          Temp
                        </span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-slate-900">
                        {selectedZone.temp.toFixed(1)}°C
                      </p>
                    </div>
                  </div>

                  <div
                  className={`p-3 sm:p-4 rounded-sm border ${selectedZone.status === 'healthy' ? 'bg-emerald-50 border-emerald-200' : selectedZone.status === 'caution' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle
                      className={`w-3 h-3 sm:w-4 sm:h-4 ${selectedZone.status === 'healthy' ? 'text-emerald-600' : selectedZone.status === 'caution' ? 'text-amber-600' : 'text-red-600'}`} />
                    
                      <span
                      className={`text-xs sm:text-sm font-bold uppercase ${selectedZone.status === 'healthy' ? 'text-emerald-800' : selectedZone.status === 'caution' ? 'text-amber-800' : 'text-red-800'}`}>
                      
                        Risk: {selectedZone.risk}%
                      </span>
                    </div>
                    <div className="w-full bg-white/50 h-2 rounded-full overflow-hidden">
                      <div
                      className={`h-full transition-all duration-500 ${selectedZone.status === 'healthy' ? 'bg-emerald-500' : selectedZone.status === 'caution' ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{
                        width: `${selectedZone.risk}%`
                      }}>
                    </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div> :

          <Card className="border-dashed">
              <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-slate-400">
                <Info className="w-6 h-6 sm:w-8 sm:h-8 mb-2 opacity-50" />
                <p className="text-xs sm:text-sm">Tap a zone to view details</p>
              </div>
            </Card>
          }
        </AnimatePresence>
      </div>
    </div>);

}