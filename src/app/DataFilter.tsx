// DataFilter.tsx
import React from 'react';
import { Filter } from 'lucide-react';

interface DataFilterProps {
  timeFilter: string;
  setTimeFilter: (filter: string) => void;
}

const DataFilter: React.FC<DataFilterProps> = ({ timeFilter, setTimeFilter }) => {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
            <Filter className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Data Filter</h2>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTimeFilter('1h')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === '1h'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            1 Hour
          </button>
          <button
            onClick={() => setTimeFilter('6h')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === '6h'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            6 Hours
          </button>
          <button
            onClick={() => setTimeFilter('24h')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === '24h'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            24 Hours
          </button>
          <button
            onClick={() => setTimeFilter('7d')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === '7d'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeFilter('30d')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === '30d'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              timeFilter === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Time
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataFilter;