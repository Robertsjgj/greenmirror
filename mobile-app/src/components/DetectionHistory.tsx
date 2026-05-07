import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { motion } from 'framer-motion';
import { Camera, Search, Filter, X, ArrowLeft, ChevronDown } from 'lucide-react';
interface DetectionEvent {
  id: string;
  timestamp: string;
  fullDate: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  thumbnail: string;
  location: string;
}
const mockHistoryData: DetectionEvent[] = [
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
  timestamp: '04:30 PM',
  fullDate: '2024-01-14',
  confidence: 45,
  status: 'rejected',
  thumbnail: 'bg-slate-200',
  location: 'Zone 2'
},
{
  id: '4',
  timestamp: '02:18 PM',
  fullDate: '2024-01-14',
  confidence: 92,
  status: 'confirmed',
  thumbnail: 'bg-slate-200',
  location: 'Zone 7'
},
{
  id: '5',
  timestamp: '11:05 AM',
  fullDate: '2024-01-14',
  confidence: 67,
  status: 'confirmed',
  thumbnail: 'bg-slate-200',
  location: 'Zone 5'
},
{
  id: '6',
  timestamp: '08:22 AM',
  fullDate: '2024-01-13',
  confidence: 78,
  status: 'pending',
  thumbnail: 'bg-slate-200',
  location: 'Zone 1'
},
{
  id: '7',
  timestamp: '06:45 PM',
  fullDate: '2024-01-12',
  confidence: 52,
  status: 'rejected',
  thumbnail: 'bg-slate-200',
  location: 'Zone 4'
},
{
  id: '8',
  timestamp: '03:30 PM',
  fullDate: '2024-01-12',
  confidence: 89,
  status: 'confirmed',
  thumbnail: 'bg-slate-200',
  location: 'Zone 9'
}];

interface DetectionHistoryProps {
  onClose: () => void;
  onSelectEvent: (event: DetectionEvent) => void;
}
export function DetectionHistory({
  onClose,
  onSelectEvent
}: DetectionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'confirmed' | 'rejected'>(
    'all');
  const [confidenceFilter, setConfidenceFilter] = useState<
    'all' | 'high' | 'medium' | 'low'>(
    'all');
  const [showFilters, setShowFilters] = useState(false);
  const filteredEvents = mockHistoryData.filter((event) => {
    const matchesSearch =
    event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.fullDate.includes(searchQuery);
    const matchesStatus =
    statusFilter === 'all' || event.status === statusFilter;
    const matchesConfidence =
    confidenceFilter === 'all' ||
    confidenceFilter === 'high' && event.confidence >= 80 ||
    confidenceFilter === 'medium' &&
    event.confidence >= 50 &&
    event.confidence < 80 ||
    confidenceFilter === 'low' && event.confidence < 50;
    return matchesSearch && matchesStatus && matchesConfidence;
  });
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={onClose}>
            
            Back
          </Button>
          <h2 className="text-xl font-bold text-slate-900">
            Detection History
          </h2>
        </div>
        <Badge variant="neutral">{filteredEvents.length} events</Badge>
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by location or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" />
              
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Filter className="w-4 h-4" />}
              onClick={() => setShowFilters(!showFilters)}>
              
              Filters
            </Button>
          </div>

          {showFilters &&
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
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
            
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">
                  Status
                </label>
                <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">
                
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">
                  Confidence
                </label>
                <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">
                
                  <option value="all">All Levels</option>
                  <option value="high">High (≥80%)</option>
                  <option value="medium">Medium (50-79%)</option>
                  <option value="low">Low (&lt;50%)</option>
                </select>
              </div>
            </motion.div>
          }
        </div>
      </Card>

      {/* Results Table */}
      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Preview
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.map((event, index) =>
              <motion.tr
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
                className="hover:bg-slate-50 transition-colors">
                
                  <td className="px-4 py-3">
                    <div
                    className={`w-12 h-12 rounded-sm ${event.thumbnail} flex items-center justify-center`}>
                    
                      <Camera className="w-5 h-5 text-slate-400" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900">
                      {event.fullDate}
                    </div>
                    <div className="text-xs text-slate-500">
                      {event.timestamp}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {event.location}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden max-w-[60px]">
                        <div
                        className={`h-full ${event.confidence >= 80 ? 'bg-emerald-500' : event.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{
                          width: `${event.confidence}%`
                        }}>
                      </div>
                      </div>
                      <span className="text-xs font-mono text-slate-600">
                        {event.confidence}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectEvent(event)}>
                    
                      View
                    </Button>
                  </td>
                </motion.tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredEvents.length === 0 &&
        <div className="py-12 text-center text-slate-500">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No detections found matching your filters</p>
          </div>
        }
      </Card>
    </div>);

}