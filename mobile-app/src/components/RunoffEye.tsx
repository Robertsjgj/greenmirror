import React, { useEffect, useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight } from
'lucide-react';
import { DetectionHistory } from './DetectionHistory';
import { DetectionDetail } from './DetectionDetail';
// Mock Data
interface DetectionEvent {
  id: string;
  timestamp: string;
  fullDate: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  thumbnail: string;
  location: string;
}
const initialEvents: DetectionEvent[] = [
{
  id: '1',
  timestamp: '10:42 AM',
  fullDate: '2024-01-15',
  confidence: 94,
  status: 'pending',
  thumbnail: 'bg-slate-300',
  location: 'Zone 3'
},
{
  id: '2',
  timestamp: '09:15 AM',
  fullDate: '2024-01-15',
  confidence: 88,
  status: 'confirmed',
  thumbnail: 'bg-slate-200',
  location: 'Zone 8'
},
{
  id: '3',
  timestamp: 'Yesterday',
  fullDate: '2024-01-14',
  confidence: 45,
  status: 'rejected',
  thumbnail: 'bg-slate-200',
  location: 'Zone 2'
},
{
  id: '4',
  timestamp: 'Yesterday',
  fullDate: '2024-01-14',
  confidence: 92,
  status: 'confirmed',
  thumbnail: 'bg-slate-200',
  location: 'Zone 7'
}];

export function RunoffEye() {
  const [events, setEvents] = useState<DetectionEvent[]>(initialEvents);
  const [activeAlert, setActiveAlert] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DetectionEvent | null>(
    null
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAlert((prev) => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  const handleCorrection = (id: string, isConfirmed: boolean) => {
    setEvents((prev) =>
    prev.map((e) =>
    e.id === id ?
    {
      ...e,
      status: isConfirmed ? 'confirmed' : 'rejected'
    } :
    e
    )
    );
  };
  const handleUpdateStatus = (
  id: string,
  status: 'confirmed' | 'rejected',
  reason?: string) =>
  {
    setEvents((prev) =>
    prev.map((e) =>
    e.id === id ?
    {
      ...e,
      status
    } :
    e
    )
    );
  };
  if (showHistory) {
    return (
      <DetectionHistory
        onClose={() => setShowHistory(false)}
        onSelectEvent={(event) => setSelectedEvent(event)} />);


  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 h-full">
        {/* Camera Feed Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="relative overflow-hidden bg-black border-slate-900 p-0">
            <div className="aspect-video w-full bg-slate-900 relative flex items-center justify-center group">
              <Camera className="w-12 h-12 sm:w-16 sm:h-16 text-slate-700" />

              {/* Camera UI Overlay */}
              <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex items-center gap-2">
                <span className="flex h-2 w-2 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-red-500"></span>
                </span>
                <span className="text-[10px] sm:text-xs font-mono text-red-500 font-bold tracking-widest">
                  LIVE • CAM-01
                </span>
              </div>

              <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 text-[10px] sm:text-xs font-mono text-slate-500">
                {new Date().toLocaleDateString()} •{' '}
                {new Date().toLocaleTimeString()}
              </div>

              {/* Alert Overlay */}
              <AnimatePresence>
                {activeAlert &&
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 20
                  }}
                  animate={{
                    opacity: 1,
                    y: 0
                  }}
                  exit={{
                    opacity: 0,
                    y: 20
                  }}
                  className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-red-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-sm shadow-lg flex items-center gap-2">
                  
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
                    <span className="text-xs sm:text-sm font-bold tracking-wide">
                      RUNOFF DETECTED
                    </span>
                  </motion.div>
                }
              </AnimatePresence>

              {/* Bounding Box Simulation */}
              {activeAlert &&
              <motion.div
                initial={{
                  opacity: 0,
                  scale: 0.9
                }}
                animate={{
                  opacity: 1,
                  scale: 1
                }}
                exit={{
                  opacity: 0
                }}
                className="absolute w-1/3 h-1/3 border-2 border-red-500 bg-red-500/10 rounded-sm top-1/3 left-1/3">
                
                  <div className="absolute -top-5 sm:-top-6 left-0 bg-red-500 text-white text-[9px] sm:text-[10px] px-1 py-0.5 font-mono">
                    CONFIDENCE: 94%
                  </div>
                </motion.div>
              }
            </div>
          </Card>

          {/* Correction Dialog (Contextual) */}
          <AnimatePresence>
            {activeAlert &&
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
              
                <Card className="border-l-4 border-l-red-500 bg-red-50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-red-900">
                        AI Detection Verification
                      </h3>
                      <p className="text-xs sm:text-sm text-red-700">
                        The system detected potential runoff. Please verify.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none bg-white border-red-200 text-red-700 hover:bg-red-50 justify-center">
                      
                        False Alarm
                      </Button>
                      <Button
                      variant="danger"
                      size="sm"
                      className="flex-1 sm:flex-none justify-center">
                      
                        Confirm
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            }
          </AnimatePresence>
        </div>

        {/* Detection Log */}
        <div className="h-full flex flex-col">
          <Card
            title="Detection Log"
            className="flex-1 flex flex-col"
            noPadding>
            
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 max-h-[500px] sm:max-h-[600px]">
              {events.map((event, index) =>
              <motion.div
                key={event.id}
                initial={{
                  opacity: 0,
                  x: 20
                }}
                animate={{
                  opacity: 1,
                  x: 0
                }}
                transition={{
                  delay: index * 0.1
                }}
                className="group flex gap-2 sm:gap-3 p-2 sm:p-3 rounded-sm border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer"
                onClick={() => setSelectedEvent(event)}>
                
                  {/* Thumbnail */}
                  <div
                  className={`w-12 h-12 sm:w-16 sm:h-16 rounded-sm flex-shrink-0 ${event.thumbnail} flex items-center justify-center`}>
                  
                    <Camera className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] sm:text-xs font-mono text-slate-500">
                          {event.timestamp}
                        </span>
                      </div>
                      <Badge
                      size="sm"
                      variant={
                      event.status === 'confirmed' ?
                      'alert' :
                      event.status === 'rejected' ?
                      'neutral' :
                      'caution'
                      }>
                      
                        {event.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] sm:text-xs font-medium text-slate-600">
                        Confidence:{' '}
                        <span className="text-slate-900">
                          {event.confidence}%
                        </span>
                      </span>

                      {event.status === 'pending' &&
                    <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCorrection(event.id, true);
                        }}
                        className="p-1.5 sm:p-1 hover:bg-emerald-100 rounded text-emerald-600"
                        title="Confirm">
                        
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCorrection(event.id, false);
                        }}
                        className="p-1.5 sm:p-1 hover:bg-red-100 rounded text-red-600"
                        title="Reject">
                        
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                    }
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs w-full justify-center"
                onClick={() => setShowHistory(true)}>
                
                View All History <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Detection Detail Modal */}
      <AnimatePresence>
        {selectedEvent &&
        <DetectionDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdateStatus={handleUpdateStatus} />

        }
      </AnimatePresence>
    </>);

}