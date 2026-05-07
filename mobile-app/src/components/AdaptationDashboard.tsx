import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer } from
'recharts';
import {
  CloudRain,
  Droplets,
  Wind,
  Thermometer,
  Activity,
  Map,
  History,
  AlertTriangle,
  TrendingUp,
  Bell,
  Calendar } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// Mock Data
const runoffData7d = [
{
  date: 'Mon',
  value: 12
},
{
  date: 'Tue',
  value: 18
},
{
  date: 'Wed',
  value: 45
},
{
  date: 'Thu',
  value: 32
},
{
  date: 'Fri',
  value: 25
},
{
  date: 'Sat',
  value: 15
},
{
  date: 'Sun',
  value: 10
}];

const runoffData30d = [
{
  date: 'Week 1',
  value: 120
},
{
  date: 'Week 2',
  value: 85
},
{
  date: 'Week 3',
  value: 145
},
{
  date: 'Week 4',
  value: 98
}];

const runoffData24h = [
{
  time: '00:00',
  value: 12
},
{
  time: '04:00',
  value: 18
},
{
  time: '08:00',
  value: 45
},
{
  time: '12:00',
  value: 32
},
{
  time: '16:00',
  value: 25
},
{
  time: '20:00',
  value: 15
},
{
  time: '24:00',
  value: 10
}];

const waterUsageData = [
{
  day: 'Mon',
  usage: 240,
  irrigation: 180
},
{
  day: 'Tue',
  usage: 139,
  irrigation: 100
},
{
  day: 'Wed',
  usage: 380,
  irrigation: 290
},
{
  day: 'Thu',
  usage: 290,
  irrigation: 210
},
{
  day: 'Fri',
  usage: 430,
  irrigation: 350
},
{
  day: 'Sat',
  usage: 320,
  irrigation: 240
},
{
  day: 'Sun',
  usage: 250,
  irrigation: 180
}];

const envData = [
{
  time: '6am',
  temp: 18,
  humidity: 40,
  soilMoisture: 35
},
{
  time: '9am',
  temp: 22,
  humidity: 35,
  soilMoisture: 38
},
{
  time: '12pm',
  temp: 26,
  humidity: 30,
  soilMoisture: 32
},
{
  time: '3pm',
  temp: 25,
  humidity: 32,
  soilMoisture: 30
},
{
  time: '6pm',
  temp: 21,
  humidity: 45,
  soilMoisture: 42
}];

const alertsData = [
{
  id: 1,
  time: '2 hours ago',
  type: 'High Risk',
  message: 'Zone 8 approaching saturation',
  severity: 'alert'
},
{
  id: 2,
  time: '5 hours ago',
  type: 'Moderate Risk',
  message: 'Rainfall detected, monitoring zones',
  severity: 'caution'
},
{
  id: 3,
  time: 'Yesterday',
  type: 'Resolved',
  message: 'Runoff event in Zone 3 cleared',
  severity: 'healthy'
}];

interface DashboardProps {
  onNavigate: (tab: string) => void;
}
type DashboardTab = 'overview' | 'trends' | 'alerts';
type TimeFrame = '24h' | '7d' | '30d';
export function AdaptationDashboard({ onNavigate }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('7d');
  const runoffDataByTimeframe = {
    '24h': runoffData24h,
    '7d': runoffData7d,
    '30d': runoffData30d
  };
  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex bg-white border border-slate-200 rounded-sm p-1">
        {[
        {
          id: 'overview',
          label: 'Overview',
          icon: Activity
        },
        {
          id: 'trends',
          label: 'Trends',
          icon: TrendingUp
        },
        {
          id: 'alerts',
          label: 'Alerts',
          icon: Bell
        }].
        map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DashboardTab)}
              className={`
                relative flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-colors
                ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}
              `}>
              
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>);

        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
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
          }}
          transition={{
            duration: 0.2
          }}>
          
          {activeTab === 'overview' &&
          <div className="space-y-6">
              {/* Top Status Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-emerald-500">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mb-1">
                        Current Risk
                      </p>
                      <h2 className="text-3xl font-bold text-slate-900">Low</h2>
                      <p className="text-xs text-slate-400 mt-2">
                        Updated 5 mins ago
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-full">
                      <Activity className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mb-1">
                        Last Event
                      </p>
                      <h2 className="text-xl font-bold text-slate-900">
                        Yesterday, 4:30 PM
                      </h2>
                      <Badge variant="caution" className="mt-2">
                        Moderate Runoff
                      </Badge>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-full">
                      <History className="w-6 h-6 text-slate-600" />
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex flex-col h-full justify-between">
                    <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mb-3">
                      Quick Actions
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      icon={<AlertTriangle className="w-3 h-3" />}
                      onClick={() => onNavigate('runoff')}>
                      
                        Runoff Eye
                      </Button>
                      <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      icon={<Map className="w-3 h-3" />}
                      onClick={() => onNavigate('digital-twin')}>
                      
                        Digital Twin
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Weather Forecast */}
              <Card title="Local Forecast">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="col-span-2 p-4 bg-slate-50 rounded-sm border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Now</p>
                      <p className="text-2xl font-bold text-slate-900">24°C</p>
                      <p className="text-xs text-slate-500">Partly Cloudy</p>
                    </div>
                    <CloudRain className="w-10 h-10 text-slate-400" />
                  </div>
                  {[1, 2, 3, 4].map((day) =>
                <div
                  key={day}
                  className="flex flex-col items-center justify-center p-2 text-center">
                  
                      <p className="text-xs text-slate-500 mb-1">+{day}d</p>
                      <div className="mb-1">
                        {day % 2 === 0 ?
                    <Wind className="w-5 h-5 text-slate-400" /> :

                    <Droplets className="w-5 h-5 text-blue-400" />
                    }
                      </div>
                      <p className="text-sm font-medium text-slate-700">
                        {22 + day}°
                      </p>
                    </div>
                )}
                </div>
              </Card>
            </div>
          }

          {activeTab === 'trends' &&
          <div className="space-y-6">
              {/* Runoff Trends with Timeframe Filter */}
              <Card
              title="Runoff Events Over Time"
              action={
              <div className="flex bg-slate-100 p-0.5 rounded-sm">
                    {(['24h', '7d', '30d'] as TimeFrame[]).map((tf) =>
                <button
                  key={tf}
                  onClick={() => setTimeFrame(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${timeFrame === tf ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  
                        {tf}
                      </button>
                )}
                  </div>
              }>
              
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={runoffDataByTimeframe[timeFrame]}>
                      <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false} />
                    
                      <XAxis
                      dataKey={timeFrame === '24h' ? 'time' : 'date'}
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }} />
                    
                      <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{
                        r: 3,
                        fill: '#3b82f6',
                        strokeWidth: 0
                      }}
                      activeDot={{
                        r: 6
                      }} />
                    
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Water Usage & Irrigation Trends */}
              <Card title="Water Usage & Irrigation">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterUsageData}>
                      <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false} />
                    
                      <XAxis
                      dataKey="day"
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <Tooltip
                      cursor={{
                        fill: '#f1f5f9'
                      }}
                      contentStyle={{
                        backgroundColor: '#fff',
                        borderRadius: '4px',
                        border: '1px solid #e2e8f0'
                      }} />
                    
                      <Bar
                      dataKey="usage"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      name="Total Usage" />
                    
                      <Bar
                      dataKey="irrigation"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      name="Irrigation" />
                    
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                    <span className="text-slate-600">Total Usage (L)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
                    <span className="text-slate-600">Irrigation (L)</span>
                  </div>
                </div>
              </Card>

              {/* Environmental Conditions */}
              <Card title="Environmental Conditions">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={envData}>
                      <defs>
                        <linearGradient
                        id="colorTemp"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1">
                        
                          <stop
                          offset="5%"
                          stopColor="#f59e0b"
                          stopOpacity={0.1} />
                        
                          <stop
                          offset="95%"
                          stopColor="#f59e0b"
                          stopOpacity={0} />
                        
                        </linearGradient>
                        <linearGradient
                        id="colorMoisture"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1">
                        
                          <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.1} />
                        
                          <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0} />
                        
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false} />
                    
                      <XAxis
                      dataKey="time"
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <YAxis
                      stroke="#94a3b8"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false} />
                    
                      <Tooltip />
                      <Area
                      type="monotone"
                      dataKey="temp"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#colorTemp)"
                      strokeWidth={2}
                      name="Temperature (°C)" />
                    
                      <Area
                      type="monotone"
                      dataKey="humidity"
                      stroke="#64748b"
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Humidity (%)" />
                    
                      <Area
                      type="monotone"
                      dataKey="soilMoisture"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorMoisture)"
                      strokeWidth={2}
                      name="Soil Moisture (%)" />
                    
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-4 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-amber-500"></div>
                    <span className="text-slate-600">Temperature</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-slate-500 border-2 border-dashed"></div>
                    <span className="text-slate-600">Humidity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                    <span className="text-slate-600">Soil Moisture</span>
                  </div>
                </div>
              </Card>
            </div>
          }

          {activeTab === 'alerts' &&
          <div className="space-y-4">
              <Card title="Recent Alerts">
                <div className="space-y-3">
                  {alertsData.map((alert) =>
                <motion.div
                  key={alert.id}
                  initial={{
                    opacity: 0,
                    x: -20
                  }}
                  animate={{
                    opacity: 1,
                    x: 0
                  }}
                  className={`p-4 rounded-sm border-l-4 ${alert.severity === 'alert' ? 'bg-red-50 border-l-red-500' : alert.severity === 'caution' ? 'bg-amber-50 border-l-amber-500' : 'bg-emerald-50 border-l-emerald-500'}`}>
                  
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={alert.severity as any} size="sm">
                              {alert.type}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {alert.time}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">
                            {alert.message}
                          </p>
                        </div>
                        <AlertTriangle
                      className={`w-5 h-5 ${alert.severity === 'alert' ? 'text-red-600' : alert.severity === 'caution' ? 'text-amber-600' : 'text-emerald-600'}`} />
                    
                      </div>
                    </motion.div>
                )}
                </div>
              </Card>

              <Card title="Alert Settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-sm">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        High Risk Threshold
                      </p>
                      <p className="text-xs text-slate-500">
                        Alert when runoff risk exceeds 70%
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-700">
                        70%
                      </span>
                      <input
                      type="range"
                      min="50"
                      max="90"
                      defaultValue="70"
                      className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600" />
                    
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-sm">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Notification Frequency
                      </p>
                      <p className="text-xs text-slate-500">
                        How often to receive alerts
                      </p>
                    </div>
                    <select className="px-3 py-1 text-sm border border-slate-200 rounded-sm bg-white">
                      <option>Real-time</option>
                      <option>Hourly digest</option>
                      <option>Daily summary</option>
                    </select>
                  </div>
                </div>
              </Card>
            </div>
          }
        </motion.div>
      </AnimatePresence>
    </div>);

}