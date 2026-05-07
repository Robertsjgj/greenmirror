import React from 'react';
import { motion } from 'framer-motion';
import { Thermometer, Droplets, Sun, Leaf } from 'lucide-react';
export function EnvironmentView() {
  return (
    <div className="space-y-6 pb-6">
      {/* Big Weather Display */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        className="bg-gradient-to-br from-blue-400 to-blue-500 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/3 -translate-x-1/4 blur-xl"></div>

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-blue-100 font-medium mb-1">Inside Greenhouse</p>
            <div className="flex items-baseline gap-2">
              <h1 className="text-6xl font-extrabold tracking-tighter">24°</h1>
              <span className="text-2xl font-bold text-blue-100">C</span>
            </div>
            <p className="text-lg font-medium mt-1">Warm & Sunny</p>
          </div>
          <div
            className="text-7xl drop-shadow-lg animate-pulse"
            style={{
              animationDuration: '3s'
            }}>
            
            ☀️
          </div>
        </div>
      </motion.div>

      {/* Condition Cards Grid */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9
          }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{
            delay: 0.1
          }}
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center text-center">
          
          <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-3">
            <Thermometer className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-stone-800">24°C</h3>
          <p className="text-sm font-medium text-stone-500">Temperature</p>
        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9
          }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{
            delay: 0.2
          }}
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center text-center">
          
          <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-3">
            <Droplets className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-stone-800">65%</h3>
          <p className="text-sm font-medium text-stone-500">Humidity</p>
        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9
          }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{
            delay: 0.3
          }}
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center text-center">
          
          <div className="w-12 h-12 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-3">
            <Sun className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-stone-800">Bright</h3>
          <p className="text-sm font-medium text-stone-500">Light Level</p>
        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9
          }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{
            delay: 0.4
          }}
          className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center text-center">
          
          <div className="w-12 h-12 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-3">
            <Leaf className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-stone-800">Moist</h3>
          <p className="text-sm font-medium text-stone-500">Soil Overall</p>
        </motion.div>
      </div>

      {/* Tip Card */}
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
          delay: 0.5
        }}
        className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-4 items-start">
        
        <div className="text-2xl shrink-0">💡</div>
        <div>
          <h4 className="font-bold text-amber-900 mb-1">Today's Tip</h4>
          <p className="text-sm text-amber-800 font-medium leading-relaxed">
            It's warm and sunny today! Your plants might drink more water than
            usual. Keep an eye on the tomatoes! 🍅
          </p>
        </div>
      </motion.div>
    </div>);

}