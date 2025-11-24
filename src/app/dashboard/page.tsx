'use client'

import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Wind, Sun, Droplets, Gauge, CloudRain, RefreshCw, AlertCircle, Navigation, Menu, X, Home, BarChart3, Settings, Download, Clock, ArrowLeft, LogOut } from 'lucide-react';

interface WeatherDataPoint {
  time?: string;
  avgWindSpeed?: number;
  direction?: number;
  compassDir?: string;
  irradiance?: number;
  tempC?: number;
  humidity?: number;
  pressure?: number;
  rainRatePerHour?: number;
  [key: string]: string | number | undefined;
}

const WeatherDashboard = () => {
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const LIMIT = 50; // Load 50 records at a time
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [containerName, setContainerName] = useState<string>('ws-tawyeen');
  const [stationName, setStationName] = useState<string>('Weather Station');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [csvFileName, setCSVFileName] = useState<string>('');
  const [showAllData, setShowAllData] = useState<boolean>(false);

  // Add logging utility
  const logDebug = (message: string, data?: any) => {
    console.log(`[WeatherDashboard] ${message}`, data || '');
  };

  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlContainer = urlParams.get('container');
  const storedContainer = localStorage.getItem('selected_station');
  const storedName = localStorage.getItem('selected_station_name');

  const selectedContainer = urlContainer || storedContainer || 'ws-tawyeen';
  const selectedName = storedName || selectedContainer;

  setContainerName(selectedContainer);
  setStationName(selectedName);

  fetchWeatherData(selectedContainer, false);
  const interval = setInterval(() => fetchWeatherData(selectedContainer, false), 5 * 60 * 1000);
  return () => clearInterval(interval);
}, []);

const handleLoadMore = () => {
  fetchWeatherData(containerName, true);
};

  const parseDateTime = (dateString: string): Date | null => {
    logDebug('Parsing date string:', dateString);
    
    if (!dateString || dateString === 'N/A' || dateString === '') {
      logDebug('Invalid or empty date string');
      return null;
    }

    // Try multiple date formats
    const formats = [
      // ISO 8601 formats
      () => new Date(dateString),
      
      // CSV common formats: "YYYY-MM-DD HH:mm:ss"
      () => {
        const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          return new Date(Date.UTC(
            parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
            parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
          ));
        }
        return null;
      },
      
      // Format: "DD/MM/YYYY HH:mm:ss"
      () => {
        const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          return new Date(Date.UTC(
            parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
            parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
          ));
        }
        return null;
      },
      
      // Format: "MM/DD/YYYY HH:mm:ss"
      () => {
        const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          return new Date(Date.UTC(
            parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]),
            parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
          ));
        }
        return null;
      },
      
      // Unix timestamp (milliseconds)
      () => {
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp) && timestamp > 1000000000000) {
          return new Date(timestamp);
        }
        return null;
      },
      
      // Unix timestamp (seconds)
      () => {
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp) && timestamp > 1000000000 && timestamp < 10000000000) {
          return new Date(timestamp * 1000);
        }
        return null;
      }
    ];

    for (const formatParser of formats) {
      try {
        const date = formatParser();
        if (date && !isNaN(date.getTime())) {
          logDebug('Successfully parsed date:', { original: dateString, parsed: date.toISOString() });
          return date;
        }
      } catch (e) {
        // Continue to next format
      }
    }

    logDebug('Failed to parse date:', dateString);
    return null;
  };
  const extractDateFromFilename = (filename: string): Date | null => {
    logDebug('Extracting date from filename:', filename);
    
    if (!filename) return null;
    
    // Pattern: wstawyeen_[UNIX_TIMESTAMP].csv
    // Extract the timestamp from filename
    const match = filename.match(/wstawyeen_(\d+)/);
    
    if (match && match[1]) {
      const timestamp = parseInt(match[1]);
      
      // Check if it's a valid Unix timestamp
      // Unix timestamps are typically in seconds (10 digits) or milliseconds (13 digits)
      if (timestamp > 1000000000 && timestamp < 100000000000) {
        const date = new Date(timestamp * 1000); // Convert to milliseconds if in seconds
        
        if (!isNaN(date.getTime())) {
          logDebug('Successfully extracted date from filename:', {
            filename: filename,
            timestamp: timestamp,
            date: date.toISOString()
          });
          return date;
        }
      }
    }
    
    logDebug('Could not extract date from filename:', filename);
    return null;
  };
  const getCombinedDateTime = (): string => {
    if (weatherData.length === 0) return 'No data available';
    
    const lastItem = weatherData[weatherData.length - 1];
    const timeValue = lastItem.time || lastItem._originalTime;
    
    // Try to get full date from filename first
    let fileDate = csvFileName ? extractDateFromFilename(csvFileName) : null;
    
    // If no date from filename, try to parse from data
    if (!fileDate && timeValue) {
      const parsed = parseDateTime(String(timeValue));
      if (parsed) {
        fileDate = parsed;
      }
    }
    
    // Parse time from data
    let timeStr = '';
    if (timeValue) {
      const time = new Date(timeValue);
      if (!isNaN(time.getTime())) {
        timeStr = time.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        });
      } else if (/^\d{1,2}:\d{2}/.test(String(timeValue))) {
        // If it's a time-only string, use it directly
        timeStr = String(timeValue);
      }
    }
    
    if (!fileDate && !timeStr) {
      return 'No timestamp available';
    }
    
    // Format: "Nov 10, 2025 - 01:34:51 PM"
    if (fileDate && timeStr) {
      const dateStr = fileDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
      });
      return `${dateStr} - ${timeStr}`;
    } else if (fileDate) {
      return fileDate.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } else {
      return timeStr;
    }
  };

  const fetchWeatherData = async (container: string, isLoadMore: boolean = false) => {
  if (isLoadMore) {
    setIsLoadingMore(true);
  } else {
    setLoading(true);
    setError(null);
  }

  try {
    logDebug('Fetching weather data for container:', container);

    const currentOffset = isLoadMore ? offset + LIMIT : 0;

    const response = await fetch('/api/weather-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        containerName: container,
        limit: LIMIT,
        offset: currentOffset
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.metadata.blobInfo.name) {
      setCSVFileName(data.metadata.blobInfo.name);
      logDebug('CSV Filename received:', data.metadata.blobInfo.name);
    }

    logDebug('Raw API response:', data);

    if (!data || !data.data || data.data.length === 0) {
      if (!isLoadMore) {
        throw new Error('No weather data found');
      }
      return;
    }

    logDebug('First 3 data points:', data.data.slice(0, 3));

    const processedData = data.data.map((item: any, index: number) => {
      logDebug(`Processing item ${index}:`, item);

      const possibleTimeFields = ['time', 'timestamp', 'date', 'datetime', 'Time', 'Timestamp', 'Date', 'DateTime'];
      let timeValue = null;

      for (const field of possibleTimeFields) {
        if (item[field]) {
          timeValue = item[field];
          logDebug(`Found time in field '${field}':`, timeValue);
          break;
        }
      }

      if (!timeValue) {
        logDebug('No time field found in item:', Object.keys(item));
      }

      const parsedDate = timeValue ? parseDateTime(String(timeValue)) : null;

      return {
        ...item,
        time: parsedDate ? parsedDate.toISOString() : timeValue,
        _originalTime: timeValue,
        _parsedDate: parsedDate ? parsedDate.toISOString() : null
      };
    });

    logDebug('Processed data sample:', processedData.slice(0, 3));

    const sortedData = processedData.sort((a: WeatherDataPoint, b: WeatherDataPoint) => {
      const dateA = a.time ? new Date(a.time).getTime() : 0;
      const dateB = b.time ? new Date(b.time).getTime() : 0;
      return dateA - dateB;
    });

    if (isLoadMore) {
      setWeatherData(prev => [...prev, ...sortedData]);
      setOffset(currentOffset);
    } else {
      setWeatherData(sortedData);
      setOffset(currentOffset);
    }

    setHasMore(data.pagination.hasMore);
    setLastUpdate(new Date());

    logDebug('Data loaded successfully. Total points:', sortedData.length);
  } catch (err) {
    console.error('Error fetching weather data:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch weather data';
    if (!isLoadMore) {
      setError(errorMessage);
    }
  } finally {
    if (isLoadMore) {
      setIsLoadingMore(false);
    } else {
      setLoading(false);
    }
  }
};

  const handleBackToSelection = () => {
    window.location.href = '/selection';
  };

  const formatXAxisDate = (dateString: string, filter: string, index?: number, dayChangePositions?: Set<number>) => {
  logDebug('Formatting X-axis date:', { dateString, filter, index });
  
  if (!dateString) return '';
  
  // Check if this is a time-only value (incomplete datetime)
  if (/^\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?$/.test(dateString)) {
    logDebug('Time-only value detected, skipping:', dateString);
    return '';
  }
  
  const date = new Date(dateString);
  
  // If date is invalid, return empty string
  if (isNaN(date.getTime())) {
    logDebug('Invalid date for X-axis, returning empty:', dateString);
    return '';
  }
  
  if (filter === '1h' || filter === '6h' || filter === '24h') {
    // Show time only for short durations
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (filter === 'all' || filter === '7d' || filter === '30d') {
    // For longer ranges, only show date at day boundaries
    if (dayChangePositions && index !== undefined) {
      if (dayChangePositions.has(index)) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return ''; // Don't show date if it's not a day boundary
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};
  const getDayChangePositions = (data: WeatherDataPoint[]): Set<number> => {
    const dayChanges = new Set<number>();
    let lastDate = '';
    
    data.forEach((item, index) => {
      if (!item.time) return;
      
      const date = new Date(item.time);
      const currentDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      // If date changed or it's the first item, mark it
      if (currentDate !== lastDate || index === 0) {
        dayChanges.add(index);
        lastDate = currentDate;
      }
    });
    
    return dayChanges;
  };

  const getFilteredData = () => {
    if (!weatherData || weatherData.length === 0) return [];
    
    const now = new Date();
    let cutoffTime: Date;
    
    switch (timeFilter) {
      case '1h':
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        return weatherData;
      default:
        return weatherData;
    }
    
    return weatherData.filter(item => {
      if (!item.time) return true;
      const itemTime = new Date(item.time);
      return itemTime >= cutoffTime;
    });
  };

  const WindCompass = ({ direction, size = 140 }: { direction: number; size?: number }) => {
    const arrowLength = size * 0.35;
    const centerX = size / 2;
    const centerY = size / 2;
    
    return (
      <div className="relative flex flex-col items-center justify-center gap-3">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute">
            <defs>
              <linearGradient id="compassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            <circle cx={centerX} cy={centerY} r={size * 0.46} fill="rgba(139, 92, 246, 0.05)" stroke="url(#compassGradient)" strokeWidth="2"/>
            
            <g fill="#6366f1" fontSize={size * 0.11} fontWeight="bold" textAnchor="middle">
              <text x={centerX} y={size * 0.15}>N</text>
              <text x={size * 0.87} y={centerY + size * 0.04}>E</text>
              <text x={centerX} y={size * 0.91}>S</text>
              <text x={size * 0.13} y={centerY + size * 0.04}>W</text>
            </g>
            
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const rad = (deg - 90) * Math.PI / 180;
              const x1 = centerX + (size * 0.4) * Math.cos(rad);
              const y1 = centerY + (size * 0.4) * Math.sin(rad);
              const x2 = centerX + (size * 0.43) * Math.cos(rad);
              const y2 = centerY + (size * 0.43) * Math.sin(rad);
              return (
                <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8b5cf6" strokeWidth="2" opacity="0.5"/>
              );
            })}
            
            <g transform={`rotate(${direction} ${centerX} ${centerY})`} filter="url(#glow)">
              <line 
                x1={centerX} 
                y1={centerY} 
                x2={centerX} 
                y2={centerY - arrowLength} 
                stroke="#8b5cf6" 
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path 
                d={`M ${centerX} ${centerY - arrowLength} 
                    L ${centerX - size * 0.08} ${centerY - arrowLength + size * 0.13}
                    L ${centerX} ${centerY - arrowLength + size * 0.08}
                    L ${centerX + size * 0.08} ${centerY - arrowLength + size * 0.13}
                    Z`}
                fill="#8b5cf6"
              />
            </g>
          </svg>
          
          <div className="absolute w-3 h-3 bg-purple-600 rounded-full shadow-lg" style={{ 
            boxShadow: '0 0 12px rgba(139, 92, 246, 0.8)' 
          }} />
        </div>
      </div>
    );
  };

  const StatCard = ({ icon: Icon, title, value, unit, gradient }: any) => (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`}></div>
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-600">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>
              {value !== null && value !== undefined ? value : 'N/A'}
            </span>
            <span className="text-sm font-medium text-gray-500">{unit}</span>
          </div>
        </div>
      </div>
      <div className={`h-1 bg-gradient-to-r ${gradient}`}></div>
    </div>
  );

  const CompassCard = ({ direction, compassDir }: any) => (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 h-full">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 opacity-5"></div>
      <div className="relative p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
            <Navigation className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Wind Direction</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-500 to-indigo-600">
                {compassDir || 'N/A'}
              </span>
              <span className="text-lg font-bold text-gray-400">{direction}°</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center mt-2">
          <WindCompass direction={direction} size={130} />
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
    </div>
  );

  const ChartCard = ({ title, dataKey, color, unit, icon: Icon, data, gradient }: any) => (
    <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center mb-6 space-x-3">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
              <stop offset="95%" stopColor={color} stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
          <XAxis 
  dataKey="time" 
  stroke="#9ca3af"
  style={{ fontSize: '11px', fontWeight: '500' }}
  tick={{ fill: '#6b7280' }}
  tickMargin={8}
  interval={Math.ceil(data.length / 8) - 1}
  tickFormatter={(value: any) => formatXAxisDate(value, timeFilter)}
/>
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: '11px', fontWeight: '500' }}
            tick={{ fill: '#6b7280' }}
            tickMargin={8}
            width={50}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.98)', 
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              padding: '12px'
            }}
            labelStyle={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}
            labelFormatter={(value) => {
              const date = new Date(value);
              if (isNaN(date.getTime())) return String(value);
              return date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit' 
              });
            }}
            formatter={(value: any) => [`${value} ${unit}`, title]}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={3}
            fill={`url(#gradient-${dataKey})`}
            dot={{ fill: color, r: 4, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const WindSpeedWithDirectionChart = ({ data }: any) => {
    const CustomizedDot = (props: any) => {
      const { cx, cy, payload, index } = props;
      const direction = payload.direction || 0;
      
      if (index % 2 !== 0) {
        return <circle cx={cx} cy={cy} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="2" />;
      }
      
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="12" fill="white" stroke="#3b82f6" strokeWidth="2.5" />
          <g transform={`rotate(${direction})`}>
            <path
              d="M 0,-7 L 3,4 L 0,1 L -3,4 Z"
              fill="#3b82f6"
              stroke="#3b82f6"
              strokeWidth="1"
            />
          </g>
        </g>
      );
    };

    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 h-full">
        <div className="flex items-center mb-4 space-x-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md">
            <Wind className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800">Wind Speed & Direction</h3>
            <p className="text-xs text-gray-500 mt-1">Arrows show wind direction • Hover for details</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradient-windSpeed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
            <XAxis 
  dataKey="time" 
  stroke="#9ca3af"
  style={{ fontSize: '11px', fontWeight: '500' }}
  tick={{ fill: '#6b7280' }}
  tickMargin={8}
  interval={Math.ceil(data.length / 8) - 1}
  tickFormatter={(value: any) => formatXAxisDate(value, timeFilter)}
/>
            <YAxis 
              stroke="#9ca3af"
              style={{ fontSize: '11px', fontWeight: '500' }}
              tick={{ fill: '#6b7280' }}
              tickMargin={8}
              width={50}
              label={{ value: 'km/h', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontWeight: 'bold', fontSize: '12px' } }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                padding: '12px'
              }}
              labelStyle={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}
              labelFormatter={(value) => {
                const date = new Date(value);
                if (isNaN(date.getTime())) return String(value);
                return date.toLocaleString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
              }}
              formatter={(value: any, name: string, props: any) => {
                const direction = props.payload.direction || 0;
                const compassDir = props.payload.compassDir || 'N/A';
                return [
                  <div key="tooltip">
                    <div className="font-bold text-blue-600">{value} km/h</div>
                    <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                      <Navigation className="w-3 h-3" style={{ transform: `rotate(${direction}deg)` }} />
                      Direction: {compassDir} ({direction}°)
                    </div>
                  </div>,
                  'Wind'
                ];
              }}
            />
            <Area 
              type="monotone" 
              dataKey="avgWindSpeed" 
              stroke="#3b82f6" 
              strokeWidth={3}
              fill="url(#gradient-windSpeed)"
              dot={<CustomizedDot />}
              activeDot={{ r: 8, strokeWidth: 3, stroke: '#fff', fill: '#3b82f6' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const Sidebar = () => (
    <>
      {sidebarOpen && (
        <div 
          className="fixed inset-0 backdrop-blur-sm bg-white/30 z-40 transition-all duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <div className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-blue-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm shadow-md border border-white/30">
                <Wind className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Weather</h2>
                <p className="text-xs text-blue-200">Monitoring</p>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <button 
              onClick={() => {
                setActiveTab('dashboard');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${activeTab === 'dashboard' ? 'bg-white/20 text-white shadow-lg border border-white/30 backdrop-blur-sm' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Home className="w-5 h-5" />
              <span>Dashboard</span>
            </button>
            
            
            
            <button 
              onClick={() => {
                setActiveTab('history');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${activeTab === 'history' ? 'bg-white/20 text-white shadow-lg border border-white/30 backdrop-blur-sm' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Clock className="w-5 h-5" />
              <span>History</span>
            </button>

            <div className="my-4 border-t border-blue-500/30"></div>
            
            <button 
              onClick={() => setSidebarOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-blue-100 hover:bg-white/10 transition-all font-medium text-sm"
            >
              <Download className="w-5 h-5" />
              <span>Export Data</span>
            </button>
            
            
          </nav>

          {/* Logout Button at Bottom */}
          <div className="p-4 border-t border-blue-500/30">
            <button 
              onClick={() => {
                fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                  window.location.href = '/auth/login';
                });
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-all font-medium text-sm border border-red-400/30"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            <RefreshCw className="w-12 h-12 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-2xl font-bold text-gray-700 mb-2">Loading Weather Data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full">
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertCircle className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-black text-gray-800 mb-3 text-center">Oops!</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <div className="space-y-3">
            <button 
              onClick={() => fetchWeatherData(containerName)}
              className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white py-4 px-6 rounded-xl hover:from-red-600 hover:to-orange-700 transition-all duration-300 flex items-center justify-center font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <RefreshCw className="w-5 h-5 mr-3" />
              Try Again
            </button>
            <button 
              onClick={handleBackToSelection}
              className="w-full bg-gray-100 text-gray-700 py-4 px-6 rounded-xl hover:bg-gray-200 transition-all duration-300 flex items-center justify-center font-bold text-lg"
            >
              <ArrowLeft className="w-5 h-5 mr-3" />
              Back to Stations
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredData = getFilteredData();
  const latestData = weatherData[weatherData.length - 1] || {};
  
  // Enhanced date formatting for "Last CSV File Sent"
  const lastReadingTime = getCombinedDateTime();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar />
      
      <div className="min-h-screen">
         <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
              <button 
                onClick={handleBackToSelection}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Back to station selection"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
              <div>
                <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Home Dashboard
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">Real-time environmental monitoring</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-700">
                    {lastUpdate.toLocaleTimeString()}
                  </span>
                </div>
              )}
              <button 
                onClick={() => fetchWeatherData(containerName)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 lg:p-8">
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{stationName}</h2>
                  <p className="text-xs text-gray-500">Weather Station</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <Clock className="w-4 h-4 text-gray-600" />
                <div className="text-left">
                  <p className="text-xs text-gray-500">Last update</p>
                  <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                    {lastReadingTime}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <StatCard 
              icon={Activity}
              title="Temperature"
              value={latestData.tempC}
              unit="°C"
              gradient="from-red-500 to-pink-500"
            />
            
            <StatCard 
              icon={Droplets}
              title="Humidity"
              value={latestData.humidity}
              unit="%"
              gradient="from-green-500 to-emerald-500"
            />
            
            <StatCard 
              icon={Sun}
              title="Solar Irradiance"
              value={latestData.irradiance}
              unit="W/m²"
              gradient="from-yellow-500 to-orange-500"
            />
            
            <StatCard 
              icon={Gauge}
              title="Pressure"
              value={latestData.pressure}
              unit="hPa"
              gradient="from-indigo-500 to-purple-600"
            />
            
            <StatCard 
              icon={Wind}
              title="Wind Speed"
              value={latestData.avgWindSpeed}
              unit="km/h"
              gradient="from-blue-500 to-cyan-500"
            />
            
            <StatCard 
              icon={CloudRain}
              title="Rain Rate"
              value={latestData.rainRatePerHour}
              unit="mm/h"
              gradient="from-cyan-500 to-blue-500"
            />
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Date Filter</h2>
                  <p className="text-sm text-gray-500">Select time range for charts</p>
                </div>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ChartCard 
              title="Temperature"
              dataKey="tempC"
              color="#ef4444"
              unit="°C"
              icon={Activity}
              data={filteredData}
              gradient="from-red-500 to-pink-500"
            />
            
            <ChartCard 
              title="Humidity"
              dataKey="humidity"
              color="#10b981"
              unit="%"
              icon={Droplets}
              data={filteredData}
              gradient="from-green-500 to-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ChartCard 
              title="Solar Irradiance"
              dataKey="irradiance"
              color="#f59e0b"
              unit="W/m²"
              icon={Sun}
              data={filteredData}
              gradient="from-yellow-500 to-orange-500"
            />
            
            <ChartCard 
              title="Atmospheric Pressure"
              dataKey="pressure"
              color="#6366f1"
              unit="hPa"
              icon={Gauge}
              data={filteredData}
              gradient="from-indigo-500 to-purple-600"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-1">
              <CompassCard 
                direction={latestData.direction || 0}
                compassDir={latestData.compassDir}
              />
            </div>
            
            <div className="lg:col-span-2">
              <WindSpeedWithDirectionChart data={filteredData} />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
  <div className="p-6 border-b border-gray-200">
    <div className="flex items-center gap-3">
      <div className="p-3 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 shadow-md">
        <Activity className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-xl font-bold text-gray-800">Historical Data</h3>
    </div>
  </div>
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Time</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Temp</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Humidity</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">S.I</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Wind</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Direction</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Pressure</th>
          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Rain</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {weatherData.slice().reverse().map((row, index) => (
          <tr key={index} className="hover:bg-blue-50 transition-colors duration-150">
            <td className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
              {row.time ? new Date(row.time).toLocaleString() : row._originalTime || 'N/A'}
            </td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.tempC}°C</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.humidity}%</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.irradiance} W/m²</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.avgWindSpeed} km/h</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.compassDir || row.direction + '°'}</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.pressure} hPa</td>
            <td className="px-6 py-4 text-sm text-gray-700">{row.rainRatePerHour} mm/h</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  {hasMore && (
    <div className="p-6 border-t border-gray-200 flex justify-center">
      <button
        onClick={handleLoadMore}
        disabled={isLoadingMore}
        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoadingMore ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            Load More Data
            <BarChart3 className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  )}
</div>
        </div>
      </div>
    </div>
  );
};

export default WeatherDashboard;