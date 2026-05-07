import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Clock,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ChevronRight } from
'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  ReferenceLine } from
'recharts';
// Mock Data
const weeklyWaterLoss = [
{
  day: 'Mon',
  loss: 12,
  expected: 15
},
{
  day: 'Tue',
  loss: 8,
  expected: 15
},
{
  day: 'Wed',
  loss: 35,
  expected: 15
},
{
  day: 'Thu',
  loss: 18,
  expected: 15
},
{
  day: 'Fri',
  loss: 10,
  expected: 15
},
{
  day: 'Sat',
  loss: 42,
  expected: 15
},
{
  day: 'Sun',
  loss: 14,
  expected: 15
}];

const runoffAlerts = [
{
  id: 1,
  emoji: '⚠️',
  title: 'Higher than expected water loss detected',
  description:
  'Saturday saw 42L of runoff — nearly 3× the normal amount. This may be from overwatering the tomatoes.',
  time: 'Yesterday',
  severity: 'high',
  read: false
},
{
  id: 2,
  emoji: '⚠️',
  title: 'Unusual runoff on Wednesday',
  description:
  'Overwatering caused extra water to flow through Section B. Try watering more slowly next time.',
  time: '4 days ago',
  severity: 'medium',
  read: false
},
{
  id: 3,
  emoji: '✅',
  title: 'Water loss back to normal',
  description:
  'Friday and Sunday levels were within the expected range. Great job!',
  time: '2 days ago',
  severity: 'low',
  read: true
}];

const recentEvents = [
{
  id: 1,
  time: 'Today, 10:30 AM',
  status: 'Good',
  message: 'Water stayed in soil',
  emoji: '✅',
  section: 'Herbs'
},
{
  id: 2,
  time: 'Yesterday, 4:15 PM',
  status: 'Too much!',
  message: '42L ran off after watering',
  emoji: '🔴',
  section: 'Tomatoes'
},
{
  id: 3,
  time: 'Yesterday, 9:00 AM',
  status: 'A little',
  message: '8L of extra water drained',
  emoji: '🟡',
  section: 'Lettuce'
},
{
  id: 4,
  time: 'Wed, 3:20 PM',
  status: 'Overwatered',
  message: 'Heavy watering caused overflow',
  emoji: '🌊',
  section: 'Section B'
}];

const getBarColor = (loss: number, expected: number) => {
  if (loss > expected * 2) return '#f43f5e'; // rose-500
  if (loss > expected) return '#f59e0b'; // amber-500
  return '#10b981'; // emerald-500
};
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const loss = payload[0].value;
  const isHigh = loss > 15 * 2;
  const isMed = loss > 15;
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-lg px-3 py-2 text-center">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p
        className={`text-lg font-extrabold ${isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-emerald-600'}`}>
        
        {loss}L
      </p>
      <p className="text-[10px] font-medium text-stone-400">water lost</p>
    </div>);

};
export function SimpleRunoff() {
  const [alerts, setAlerts] = useState(runoffAlerts);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const totalLoss = weeklyWaterLoss.reduce((sum, d) => sum + d.loss, 0);
  const avgLoss = Math.round(totalLoss / weeklyWaterLoss.length);
  const maxDay = weeklyWaterLoss.reduce(
    (max, d) => d.loss > max.loss ? d : max,
    weeklyWaterLoss[0]
  );
  const unusualDays = weeklyWaterLoss.filter(
    (d) => d.loss > d.expected * 1.5
  ).length;
  const markAlertRead = (id: number) => {
    setAlerts(
      alerts.map((a) =>
      a.id === id ?
      {
        ...a,
        read: true
      } :
      a
      )
    );
  };
  const visibleEvents = showAllEvents ? recentEvents : recentEvents.slice(0, 2);
  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Water Runoff</h2>
        <p className="text-stone-500 font-medium mt-1">
          Track where your water goes 💧
        </p>
      </div>

      {/* Status Card */}
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.95
        }}
        animate={{
          opacity: 1,
          scale: 1
        }}
        className={`rounded-3xl p-5 text-center shadow-sm border-2 ${unusualDays > 1 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${unusualDays > 1 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
          
          <Droplets
            className={`w-8 h-8 ${unusualDays > 1 ? 'text-amber-500' : 'text-emerald-500'}`} />
          
        </div>
        <h3
          className={`text-sm font-bold uppercase tracking-wider mb-1 ${unusualDays > 1 ? 'text-amber-700' : 'text-emerald-700'}`}>
          
          This Week
        </h3>
        <div
          className={`text-3xl font-extrabold mb-2 ${unusualDays > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
          
          {unusualDays > 1 ? 'Needs Attention' : 'Looking Good!'}
        </div>
        <p
          className={`text-sm font-medium py-1.5 px-4 rounded-xl inline-block ${unusualDays > 1 ? 'bg-amber-100/50 text-amber-800' : 'bg-emerald-100/50 text-emerald-800'}`}>
          
          {unusualDays > 1 ?
          `${unusualDays} days had higher water loss than expected` :
          'Most of the water is staying in the soil! 🌱'}
        </p>
      </motion.div>

      {/* Weekly Stats */}
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
          delay: 0.05
        }}
        className="grid grid-cols-3 gap-3">
        
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3 text-center">
          <p className="text-2xl font-extrabold text-stone-800">{totalLoss}L</p>
          <p className="text-[11px] font-bold text-stone-400 mt-0.5">
            Total Lost
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3 text-center">
          <p className="text-2xl font-extrabold text-stone-800">{avgLoss}L</p>
          <p className="text-[11px] font-bold text-stone-400 mt-0.5">
            Daily Avg
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3 text-center">
          <p
            className={`text-2xl font-extrabold ${maxDay.loss > 30 ? 'text-rose-600' : 'text-stone-800'}`}>
            
            {maxDay.loss}L
          </p>
          <p className="text-[11px] font-bold text-stone-400 mt-0.5">
            Peak ({maxDay.day})
          </p>
        </div>
      </motion.div>

      {/* Water Loss Chart */}
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
        className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
        
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-stone-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-stone-400" />
            Water Loss This Week
          </h3>
        </div>
        <p className="text-xs text-stone-500 font-medium mb-4">
          How much water ran off each day (in liters)
        </p>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyWaterLoss} barCategoryGap="25%">
              <XAxis
                dataKey="day"
                stroke="#a8a29e"
                fontSize={12}
                fontWeight={700}
                tickLine={false}
                axisLine={false} />
              
              <YAxis
                stroke="#a8a29e"
                fontSize={11}
                fontWeight={600}
                tickLine={false}
                axisLine={false}
                width={30}
                tickFormatter={(v) => `${v}L`} />
              
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  fill: 'transparent'
                }} />
              
              <ReferenceLine
                y={15}
                stroke="#d6d3d1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Normal',
                  position: 'right',
                  fill: '#a8a29e',
                  fontSize: 10,
                  fontWeight: 700
                }} />
              
              <Bar dataKey="loss" radius={[8, 8, 4, 4]} maxBarSize={36}>
                {weeklyWaterLoss.map((entry, index) =>
                <Cell
                  key={index}
                  fill={getBarColor(entry.loss, entry.expected)} />

                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-4 mt-3 text-[10px] font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-stone-500">Normal</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-stone-500">A bit high</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span className="text-stone-500">Too much!</span>
          </span>
        </div>
      </motion.div>

      {/* Runoff Alerts */}
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
        }}>
        
        <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Runoff Alerts
        </h3>
        <div className="space-y-3">
          <AnimatePresence>
            {alerts.map((alert) =>
            <motion.div
              key={alert.id}
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
                x: -30
              }}
              layout
              className={`
                  p-4 rounded-2xl border shadow-sm border-l-4 transition-all
                  ${alert.read ? 'border-l-stone-300 bg-white/60 border-stone-200' : alert.severity === 'high' ? 'border-l-rose-500 bg-rose-50/50 border-stone-200' : alert.severity === 'medium' ? 'border-l-amber-500 bg-amber-50/50 border-stone-200' : 'border-l-emerald-500 bg-emerald-50/50 border-stone-200'}
                `}>
              
                <div className="flex items-start gap-3">
                  <div className="text-xl shrink-0 mt-0.5">{alert.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <h4
                    className={`font-bold text-sm mb-1 ${alert.read ? 'text-stone-500' : 'text-stone-900'}`}>
                    
                      {alert.title}
                    </h4>
                    <p
                    className={`text-xs leading-relaxed mb-2 ${alert.read ? 'text-stone-400' : 'text-stone-600'}`}>
                    
                      {alert.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
                      <Clock className="w-3 h-3" />
                      {alert.time}
                    </div>
                  </div>
                  {!alert.read &&
                <button
                  onClick={() => markAlertRead(alert.id)}
                  className="shrink-0 p-1.5 text-stone-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors active:scale-90"
                  aria-label="Dismiss alert">
                  
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                }
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Recent Events */}
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
        }}>
        
        <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-stone-400" />
          Recent Events
        </h3>
        <div className="space-y-3">
          <AnimatePresence>
            {visibleEvents.map((event, index) =>
            <motion.div
              key={event.id}
              initial={{
                opacity: 0,
                y: 10
              }}
              animate={{
                opacity: 1,
                y: 0
              }}
              transition={{
                delay: index * 0.05
              }}
              className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              
                <div className="text-xl bg-stone-50 w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                  {event.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-bold text-stone-800 text-sm">
                      {event.status}
                    </h4>
                    <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">
                      {event.section}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 font-medium">
                    {event.message}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-1">
                    {event.time}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {recentEvents.length > 2 &&
        <button
          onClick={() => setShowAllEvents(!showAllEvents)}
          className="w-full mt-3 py-2.5 text-sm font-bold text-stone-500 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors flex items-center justify-center gap-1 active:scale-[0.98]">
          
            {showAllEvents ?
          'Show less' :
          `Show all ${recentEvents.length} events`}
            <ChevronRight
            className={`w-4 h-4 transition-transform ${showAllEvents ? 'rotate-90' : ''}`} />
          
          </button>
        }
      </motion.div>

      {/* Educational Tip */}
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
        className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-4 items-start">
        
        <div className="text-2xl shrink-0">💡</div>
        <div>
          <h4 className="font-bold text-blue-900 mb-1">What is Runoff?</h4>
          <p className="text-sm text-blue-800 font-medium leading-relaxed">
            Runoff happens when we give plants more water than the soil can
            hold. The extra water flows away instead of feeding the roots. Water
            slowly and in small amounts to keep it where plants need it! 🧽
          </p>
        </div>
      </motion.div>
    </div>);

}