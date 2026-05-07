import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Droplets, Clock, Sparkles, Thermometer } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip } from
'recharts';
interface PlantData {
  id: string;
  emoji: string;
  name: string;
  plantType?: string;
  status: string;
  statusText: string;
  moisture: number;
  soilTempC?: number | null;
  alerts?: string[];
  zoneId?: string;
  nodeId?: string;
  lastWatered: string;
}
interface PlantDetailProps {
  plant: PlantData;
  onBack: () => void;
}
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'healthy':
      return {
        label: 'Good',
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        barColor: '#10b981'
      };
    case 'monitor':
      return {
        label: 'Monitor',
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        barColor: '#f59e0b'
      };
    case 'needs-water':
      return {
        label: 'Needs Water',
        bg: 'bg-rose-100',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
        barColor: '#f43f5e'
      };
    default:
      return {
        label: 'Unknown',
        bg: 'bg-stone-100',
        text: 'text-stone-700',
        border: 'border-stone-200',
        dot: 'bg-stone-500',
        barColor: '#78716c'
      };
  }
};
const getMoistureLabel = (moisture: number) => {
  if (moisture < 25)
  return {
    text: 'Very Dry 🏜️',
    color: 'text-rose-600'
  };
  if (moisture < 50)
  return {
    text: 'Getting Dry 💨',
    color: 'text-amber-600'
  };
  if (moisture < 75)
  return {
    text: 'Just Right 👌',
    color: 'text-emerald-600'
  };
  return {
    text: 'Nice & Wet 💧',
    color: 'text-blue-600'
  };
};
const getDynamicAction = (moisture: number) => {
  if (moisture < 25)
  return {
    action: 'Water 200ml now',
    actionEmoji: '💧'
  };
  if (moisture < 50)
  return {
    action: 'Water 150ml today',
    actionEmoji: '💧'
  };
  if (moisture < 75)
  return {
    action: 'No watering needed',
    actionEmoji: '✅'
  };
  return {
    action: 'Stop watering',
    actionEmoji: '🛑'
  };
};
const generateMockTrend = (currentMoisture: number) => {
  // Generate a plausible 5-day trend ending at current moisture
  return [
  {
    day: 'Mon',
    value: Math.min(100, currentMoisture + 40)
  },
  {
    day: 'Tue',
    value: Math.min(100, currentMoisture + 30)
  },
  {
    day: 'Wed',
    value: Math.min(100, currentMoisture + 20)
  },
  {
    day: 'Thu',
    value: Math.min(100, currentMoisture + 10)
  },
  {
    day: 'Fri',
    value: currentMoisture
  }];

};
const getFunFact = (plantType?: string) => {
  if (!plantType)
  return "Did you know? Plants can 'hear' water! They can sense the vibrations of water moving underground.";
  const type = plantType.toLowerCase();
  if (type.includes('tomato'))
  return 'Tomatoes are actually fruits, not vegetables! They love warm, sunny spots.';
  if (type.includes('lettuce'))
  return 'Lettuce grows best in cool weather. It can even handle a light frost!';
  if (type.includes('herb'))
  return 'Most herbs prefer soil that dries out a little between waterings. Less is more!';
  if (type.includes('pepper'))
  return 'Peppers change color as they ripen — green turns to red, yellow, or orange!';
  if (type.includes('strawberr'))
  return 'Strawberries are the only fruit with seeds on the outside. Each berry has about 200 seeds!';
  return `Taking good care of your ${plantType} will help it grow strong and healthy!`;
};
export function PlantDetail({ plant, onBack }: PlantDetailProps) {
  const statusConfig = getStatusConfig(plant.status);
  const moistureLabel = getMoistureLabel(plant.moisture);
  const { action, actionEmoji } = getDynamicAction(plant.moisture);
  const moistureTrend = generateMockTrend(plant.moisture);
  const funFact = getFunFact(plant.plantType);
  const trendColor =
  plant.moisture < 30 ?
  '#f43f5e' :
  plant.moisture < 60 ?
  '#f59e0b' :
  '#10b981';
  return (
    <div className="space-y-5 pb-6">
      {/* Back Button + Header */}
      <motion.div
        initial={{
          opacity: 0,
          x: -20
        }}
        animate={{
          opacity: 1,
          x: 0
        }}>
        
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-500 font-bold text-sm mb-4 hover:text-stone-700 transition-colors active:scale-95">
          
          <ArrowLeft className="w-5 h-5" />
          Back to Plants
        </button>

        {/* Plant Hero */}
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 text-center">
          <motion.div
            initial={{
              scale: 0.5,
              opacity: 0
            }}
            animate={{
              scale: 1,
              opacity: 1
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15
            }}
            className="text-7xl mb-3">
            
            {plant.emoji}
          </motion.div>
          <h1 className="text-2xl font-extrabold text-stone-800 mb-1">
            {plant.name}
          </h1>
          {plant.plantType &&
          <p className="text-sm font-bold text-stone-400 mb-3 uppercase tracking-wider">
              {plant.plantType}
            </p>
          }
          {plant.zoneId &&
          <p className="text-xs font-bold text-emerald-600 mb-3 uppercase tracking-wider">
              {plant.zoneId}
            </p>
          }
          {plant.nodeId &&
          <p className="text-xs font-bold text-stone-400 mb-3 uppercase tracking-wider">
              {plant.nodeId}
            </p>
          }
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} ${!plant.plantType && 'mt-2'}`}>
            
            <div
              className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot} animate-pulse`} />
            
            {statusConfig.label}
          </div>
        </div>
      </motion.div>

      {/* Recommended Action */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          delay: 0.1
        }}
        className={`rounded-2xl p-4 flex items-center gap-4 border ${plant.status === 'needs-water' ? 'bg-blue-50 border-blue-200' : plant.status === 'monitor' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        
        <div className="text-3xl shrink-0">{actionEmoji}</div>
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-0.5">
            What to do
          </p>
          <p className="text-base font-bold text-stone-800">{action}</p>
        </div>
      </motion.div>

      {/* Soil Moisture */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          delay: 0.15
        }}
        className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
        
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-stone-800">Soil Moisture</h3>
          </div>
          <span className={`text-sm font-extrabold ${moistureLabel.color}`}>
            {moistureLabel.text}
          </span>
        </div>

        {/* Big Moisture Bar */}
        <div className="relative h-8 bg-stone-100 rounded-full overflow-hidden mb-3">
          <motion.div
            initial={{
              width: 0
            }}
            animate={{
              width: `${plant.moisture}%`
            }}
            transition={{
              duration: 1,
              ease: 'easeOut',
              delay: 0.3
            }}
            className="h-full rounded-full relative"
            style={{
              backgroundColor: statusConfig.barColor
            }}>
            
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-sm font-extrabold drop-shadow-sm">
              {plant.moisture}%
            </span>
          </motion.div>
        </div>

        {/* Scale Labels */}
        <div className="flex justify-between text-[11px] font-bold text-stone-400 px-1">
          <span>🏜️ Dry</span>
          <span>👌 Good</span>
          <span>💧 Wet</span>
        </div>

        <div className="flex items-center gap-2 mt-4 text-sm text-stone-500 font-medium bg-stone-50 rounded-xl p-3">
          <Clock className="w-4 h-4 text-stone-400 shrink-0" />
          Last watered:{' '}
          <span className="font-bold text-stone-700">{plant.lastWatered}</span>
        </div>

        <div className="flex items-center gap-2 mt-3 text-sm text-stone-500 font-medium bg-stone-50 rounded-xl p-3">
          <Thermometer className="w-4 h-4 text-amber-400 shrink-0" />
          Soil temp:{' '}
          <span className="font-bold text-stone-700">
            {plant.soilTempC !== undefined
            ? plant.soilTempC !== null
              ? `${plant.soilTempC.toFixed(1)}°C`
              : 'Sensor not detected'
            : 'No data yet'}
          </span>
        </div>

        {plant.alerts && plant.alerts.length > 0 &&
        <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3">
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">
              Alerts
            </p>
            <p className="mt-1 text-sm font-bold text-rose-800">
              {plant.alerts.join(', ')}
            </p>
          </div>
        }
      </motion.div>

      {/* Moisture Trend */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          delay: 0.2
        }}
        className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
        
        <h3 className="font-bold text-stone-800 mb-1">This Week's Moisture</h3>
        <p className="text-xs text-stone-500 font-medium mb-4">
          How wet the soil has been each day 📊
        </p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={moistureTrend}>
              <XAxis
                dataKey="day"
                stroke="#a8a29e"
                fontSize={12}
                fontWeight={600}
                tickLine={false}
                axisLine={false} />
              
              <YAxis
                domain={[0, 100]}
                stroke="#a8a29e"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                width={40} />
              
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontWeight: 700,
                  fontSize: '13px'
                }}
                formatter={(value: number) => [`${value}%`, 'Moisture']} />
              
              <Line
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={3}
                dot={{
                  r: 5,
                  fill: trendColor,
                  strokeWidth: 2,
                  stroke: '#fff'
                }}
                activeDot={{
                  r: 8,
                  fill: trendColor,
                  stroke: '#fff',
                  strokeWidth: 3
                }} />
              
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Zones */}
        <div className="flex justify-between mt-3 text-[10px] font-bold">
          <span className="text-rose-400 bg-rose-50 px-2 py-0.5 rounded-full">
            🏜️ Too Dry
          </span>
          <span className="text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
            👌 Ideal Zone
          </span>
          <span className="text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full">
            💧 Too Wet
          </span>
        </div>
      </motion.div>

      {/* Fun Fact */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          delay: 0.25
        }}
        className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex gap-4 items-start">
        
        <div className="text-2xl shrink-0">
          <Sparkles className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h4 className="font-bold text-purple-900 mb-1">Did You Know?</h4>
          <p className="text-sm text-purple-800 font-medium leading-relaxed">
            {funFact}
          </p>
        </div>
      </motion.div>
    </div>);

}
