import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { motion } from 'framer-motion';
import {
  X,
  Camera,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle } from
'lucide-react';
interface DetectionEvent {
  id: string;
  timestamp: string;
  fullDate: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  thumbnail: string;
  location: string;
}
interface DetectionDetailProps {
  event: DetectionEvent;
  onClose: () => void;
  onUpdateStatus: (
  id: string,
  status: 'confirmed' | 'rejected',
  reason?: string)
  => void;
}
const rejectionReasons = [
'Shadow or lighting artifact',
'Water from irrigation (not runoff)',
'Debris or foreign object',
'Camera lens obstruction',
'Weather-related (rain, fog)',
'Other (specify in notes)'];

export function DetectionDetail({
  event,
  onClose,
  onUpdateStatus
}: DetectionDetailProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [notes, setNotes] = useState('');
  const handleReject = () => {
    onUpdateStatus(event.id, 'rejected', selectedReason || notes);
    onClose();
  };
  const handleConfirm = () => {
    onUpdateStatus(event.id, 'confirmed');
    onClose();
  };
  return (
    <motion.div
      initial={{
        opacity: 0
      }}
      animate={{
        opacity: 1
      }}
      exit={{
        opacity: 0
      }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      
      <motion.div
        initial={{
          scale: 0.95,
          opacity: 0
        }}
        animate={{
          scale: 1,
          opacity: 1
        }}
        exit={{
          scale: 0.95,
          opacity: 0
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-sm shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-900">
            Detection Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-sm transition-colors">
            
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Image Preview */}
          <div className="aspect-video bg-slate-900 rounded-sm overflow-hidden relative flex items-center justify-center">
            <Camera className="w-16 h-16 text-slate-700" />

            {/* Simulated bounding box */}
            <div className="absolute w-1/3 h-1/3 border-2 border-red-500 bg-red-500/10 rounded-sm top-1/3 left-1/3">
              <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-0.5 font-mono">
                CONFIDENCE: {event.confidence}%
              </div>
            </div>

            {/* Status Badge */}
            <div className="absolute top-4 right-4">
              <Badge
                variant={
                event.status === 'confirmed' ?
                'alert' :
                event.status === 'rejected' ?
                'neutral' :
                'caution'
                }>
                
                {event.status.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-sm">
              <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase mb-0.5">
                  Detected
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {event.fullDate}
                </p>
                <p className="text-xs text-slate-600">{event.timestamp}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-sm">
              <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase mb-0.5">
                  Location
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {event.location}
                </p>
                <p className="text-xs text-slate-600">Greenhouse A</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-sm">
              <AlertTriangle className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase mb-0.5">
                  Confidence
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {event.confidence}%
                </p>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full ${event.confidence >= 80 ? 'bg-emerald-500' : event.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{
                      width: `${event.confidence}%`
                    }}>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Section */}
          {event.status === 'pending' &&
          <Card className="border-amber-100 bg-amber-50/30">
              <h3 className="text-sm font-bold text-slate-900 mb-4">
                Verify Detection
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    If this is a false alarm, select a reason:
                  </label>
                  <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">
                  
                    <option value="">Select a reason...</option>
                    {rejectionReasons.map((reason) =>
                  <option key={reason} value={reason}>
                        {reason}
                      </option>
                  )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    Additional notes (optional):
                  </label>
                  <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional context..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none" />
                
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                  variant="outline"
                  className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                  icon={<XCircle className="w-4 h-4" />}
                  onClick={handleReject}
                  disabled={!selectedReason && !notes}>
                  
                    Mark as False Alarm
                  </Button>
                  <Button
                  variant="primary"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  icon={<CheckCircle className="w-4 h-4" />}
                  onClick={handleConfirm}>
                  
                    Confirm Runoff
                  </Button>
                </div>
              </div>
            </Card>
          }

          {/* Already Verified */}
          {event.status !== 'pending' &&
          <Card
            className={
            event.status === 'confirmed' ?
            'border-red-100 bg-red-50/30' :
            'border-slate-100 bg-slate-50/30'
            }>
            
              <div className="flex items-center gap-3">
                {event.status === 'confirmed' ?
              <CheckCircle className="w-5 h-5 text-red-600" /> :

              <XCircle className="w-5 h-5 text-slate-600" />
              }
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {event.status === 'confirmed' ?
                  'Confirmed Runoff Event' :
                  'Marked as False Alarm'}
                  </p>
                  <p className="text-xs text-slate-600">
                    This detection has already been reviewed
                  </p>
                </div>
              </div>
            </Card>
          }
        </div>
      </motion.div>
    </motion.div>);

}