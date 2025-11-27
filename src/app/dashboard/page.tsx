'use client'

import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Wind, Sun, Droplets, Gauge, CloudRain, RefreshCw, AlertCircle, Navigation, Menu, X, Home, BarChart3, Settings, Clock, ArrowLeft, LogOut } from 'lucide-react';

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
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [containerName, setContainerName] = useState<string>('ws-tawyeen');
  const [stationName, setStationName] = useState<string>('Weather Station');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [timeFilter, setTimeFilter] = useState<string>('24h');
  const [csvFileName, setCSVFileName] = useState<string>('');
  const [showAllData, setShowAllData] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState<boolean>(true);
  const historyRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const logDebug = (message: string, data?: any) => {
    console.log(`[WeatherDashboard] ${message}`, data || '');
  };

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlContainer = urlParams.get('container');
    const storedContainer = 'ws-tawyeen';
    const storedName = 'Weather Station';

    const selectedContainer = urlContainer || storedContainer;
    const selectedName = storedName;

    setContainerName(selectedContainer);
    setStationName(selectedName);

    fetchWeatherData(selectedContainer);
    const interval = setInterval(() => fetchWeatherData(selectedContainer), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        setAdminCheckLoading(true);
        setIsAdmin(false);
      } catch (error) {
        console.error('Failed to check admin status:', error);
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    };

    checkAdminStatus();
  }, []);

  const parseDateTime = (dateString: string): Date | null => {
    if (!dateString || dateString === 'N/A' || dateString === '') {
      return null;
    }

    const formats = [
      () => new Date(dateString),
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
    ];

    for (const formatParser of formats) {
      try {
        const date = formatParser();
        if (date && !isNaN(date.getTime())) {
          return date;
        }
      } catch (e) {
        // Continue
      }
    }

    return null;
  };

  const extractDateFromFilename = (filename: string): Date | null => {
    if (!filename) return null;
    const match = filename.match(/wstawyeen_(\d+)/);
    if (match && match[1]) {
      const timestamp = parseInt(match[1]);
      if (timestamp > 1000000000 && timestamp < 100000000000) {
        const date = new Date(timestamp * 1000);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    return null;
  };

  const getCombinedDateTime = (): string => {
    if (weatherData.length === 0) return 'No data available';
    
    const lastItem = weatherData[weatherData.length - 1];
    const timeValue = lastItem.time || lastItem._originalTime;
    
    let fileDate = csvFileName ? extractDateFromFilename(csvFileName) : null;
    
    if (!fileDate && timeValue) {
      const parsed = parseDateTime(String(timeValue));
      if (parsed) {
        fileDate = parsed;
      }
    }
    
    let timeStr = '';
    if (timeValue) {
      const time = new Date(timeValue);
      if (!isNaN(time.getTime())) {
        timeStr = time.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        });
      }
    }
    
    if (!fileDate && !timeStr) {
      return 'No timestamp available';
    }
    
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
        minute: '2-digit'
      });
    } else {
      return timeStr;
    }
  };

  useEffect(() => {
    document.title = 'Weather Dashboard';
  }, []);

  const fetchWeatherData = async (container: string) => {
    setLoading(true);
    setError(null);

    try {
      logDebug('Fetching ALL weather data for container:', container);

      const response = await fetch('/api/weather-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          containerName: container,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.metadata?.blobInfo?.name) {
        setCSVFileName(data.metadata.blobInfo.name);
        logDebug('CSV Filename received:', data.metadata.blobInfo.name);
      }

      logDebug('Raw API response:', data);

      if (!data || !data.data || data.data.length === 0) {
        throw new Error('No weather data found');
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

      setWeatherData(sortedData);
      setLastUpdate(new Date());

      logDebug('ALL data loaded successfully. Total points:', sortedData.length);
    } catch (err) {
      console.error('Error fetching weather data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch weather data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatXAxisDate = (dateString: string, filter: string) => {
    if (!dateString) return '';
    if (/^\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?$/.test(dateString)) {
      return '';
    }
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    
    if (filter === '1h' || filter === '6h') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (filter === '24h') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (filter === '7d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getOptimalDataSampling = (data: WeatherDataPoint[], filter: string): WeatherDataPoint[] => {
    if (!data || data.length === 0) return [];
    
    if (filter === '1h' || filter === '6h' || filter === '24h') {
      return data;
    }
    
    let sampleRate = 1;
    
    if (filter === '7d' && data.length > 100) {
      sampleRate = Math.ceil(data.length / 100);
    } else if (filter === '30d' && data.length > 150) {
      sampleRate = Math.ceil(data.length / 150);
    } else if (filter === 'all' && data.length > 200) {
      sampleRate = Math.ceil(data.length / 200);
    }
    
    if (sampleRate === 1) return data;
    
    const sampledData = [];
    sampledData.push(data[0]);
    
    for (let i = sampleRate; i < data.length - 1; i += sampleRate) {
      sampledData.push(data[i]);
    }
    
    sampledData.push(data[data.length - 1]);
    
    return sampledData;
  };

  const getFilteredData = () => {
    if (!weatherData || weatherData.length === 0) return [];
    
    const now = new Date();
    let cutoffTime: Date;
    let filtered: WeatherDataPoint[];
    
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
      default:
        return getOptimalDataSampling(weatherData, timeFilter);
    }
    
    filtered = weatherData.filter(item => {
      if (!item.time) return true;
      const itemTime = new Date(item.time);
      return itemTime >= cutoffTime;
    });
    
    return getOptimalDataSampling(filtered, timeFilter);
  };

  const WindCompass = ({ direction, size = 120 }: { direction: number; size?: number }) => {
    const arrowLength = size * 0.35;
    const centerX = size / 2;
    const centerY = size / 2;
    
    return (
      <div className="flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg">
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
      </div>
    );
  };

  const StatCard = ({ icon: Icon, title, value, unit, gradient }: any) => (
    <div className="relative overflow-hidden bg-white rounded-xl sm:rounded-2xl shadow-md hover:shadow-lg transition-all duration-300">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`}></div>
      <div className="relative p-4 sm:p-6">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs sm:text-sm font-semibold text-gray-600">{title}</p>
          <div className="flex items-baseline gap-1 sm:gap-2">
            <span className={`text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>
              {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(1) : value) : 'N/A'}
            </span>
            <span className="text-xs sm:text-sm font-medium text-gray-500">{unit}</span>
          </div>
        </div>
      </div>
      <div className={`h-1 bg-gradient-to-r ${gradient}`}></div>
    </div>
  );

  const CompassCard = ({ direction, compassDir }: any) => (
    <div className="relative overflow-hidden bg-white rounded-xl sm:rounded-2xl shadow-md hover:shadow-lg transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 opacity-5"></div>
      <div className="relative p-4 sm:p-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-4">
          <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
            <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-gray-600">Wind Direction</p>
            <div className="flex items-center gap-1 sm:gap-2 mt-1">
              <span className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-500 to-indigo-600">
                {compassDir || 'N/A'}
              </span>
              <span className="text-sm sm:text-lg font-bold text-gray-400">{direction || 0}°</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center mt-3">
          <WindCompass direction={direction || 0} size={isMobile ? 100 : 120} />
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
    </div>
  );

  const ChartCard = ({ title, dataKey, color, unit, icon: Icon, data, gradient }: any) => (
    <div className="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center mb-4 sm:mb-6 gap-2 sm:gap-3">
        <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-800 truncate">{title}</h3>
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
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
            style={{ fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}
            tick={{ fill: '#6b7280' }}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={isMobile ? 40 : 50}
            tickFormatter={(value: any) => formatXAxisDate(value, timeFilter)}
          />
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}
            tick={{ fill: '#6b7280' }}
            tickMargin={8}
            width={isMobile ? 40 : 50}
            label={{ 
              value: unit, 
              angle: -90, 
              position: 'insideLeft', 
              style: { 
                fill: '#6b7280', 
                fontWeight: 'bold', 
                fontSize: isMobile ? '11px' : '12px' 
              } 
            }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.98)', 
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
              padding: '12px',
              fontSize: '12px'
            }}
            labelStyle={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}
            labelFormatter={(value) => {
              const date = new Date(value);
              if (isNaN(date.getTime())) return String(value);
              return date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit' 
              });
            }}
            formatter={(value: any) => [`${typeof value === 'number' ? value.toFixed(1) : value} ${unit}`, title]}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={isMobile ? 2 : 3}
            fill={`url(#gradient-${dataKey})`}
            dot={false}
            activeDot={{ r: isMobile ? 4 : 6, strokeWidth: 2, stroke: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const WindSpeedWithDirectionChart = ({ data }: any) => {
    const CustomizedDot = (props: any) => {
      const { cx, cy, payload, index } = props;
      const direction = payload.direction || 0;
      
      const dataLength = data.length;
      let displayInterval = 1;
      
      if (dataLength > 200) {
        displayInterval = Math.ceil(dataLength / 12);
      } else if (dataLength > 100) {
        displayInterval = Math.ceil(dataLength / 15);
      } else if (dataLength > 50) {
        displayInterval = Math.ceil(dataLength / 20);
      } else {
        displayInterval = Math.ceil(dataLength / 25);
      }
      
      if (index % displayInterval !== 0) {
        return null;
      }
        
      const dotSize = isMobile ? 8 : 12;
      const arrowSize = isMobile ? 5 : 7;
        
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r={dotSize} fill="white" stroke="#3b82f6" strokeWidth="2" />
          <g transform={`rotate(${direction})`}>
            <path
              d={`M 0,-${arrowSize} L ${arrowSize * 0.75},${arrowSize * 0.5} L 0,${arrowSize * 0.13} L -${arrowSize * 0.75},${arrowSize * 0.5} Z`}
              fill="#3b82f6"
              stroke="#3b82f6"
              strokeWidth="1"
            />
          </g>
        </g>
      );
    };

    return (
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 hover:shadow-lg transition-all duration-300">
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md flex-shrink-0">
            <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-gray-800">Wind Speed & Direction</h3>
            <p className="text-xs text-gray-500 mt-1 hidden sm:block">Arrows show wind direction</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
          <AreaChart data={data} margin={{ top: isMobile ? 10 : 20, right: 10, left: 0, bottom: 5 }}>
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
              style={{ fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}
              tick={{ fill: '#6b7280' }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 40 : 50}
              tickFormatter={(value: any) => formatXAxisDate(value, timeFilter)}
            />
            <YAxis 
              stroke="#9ca3af"
              style={{ fontSize: isMobile ? '10px' : '11px', fontWeight: '500' }}
              tick={{ fill: '#6b7280' }}
              tickMargin={8}
              width={isMobile ? 35 : 50}
              label={{ 
                value: 'km/h', 
                angle: -90, 
                position: 'insideLeft', 
                style: { 
                  fill: '#6b7280', 
                  fontWeight: 'bold', 
                  fontSize: isMobile ? '11px' : '12px' 
                } 
              }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                padding: '12px',
                fontSize: '12px'
              }}
              labelStyle={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}
              labelFormatter={(value) => {
                const date = new Date(value);
                if (isNaN(date.getTime())) return String(value);
                return date.toLocaleString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
              }}
              formatter={(value: any, name: string, props: any) => {
                const direction = props.payload.direction || 0;
                const compassDir = props.payload.compassDir || 'N/A';
                return [
                  <div key="tooltip">
                    <div className="font-bold text-blue-600">{typeof value === 'number' ? value.toFixed(1) : value} km/h</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Direction: {compassDir} ({Math.round(direction)}°)
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
              strokeWidth={isMobile ? 2 : 3}
              fill="url(#gradient-windSpeed)"
              dot={<CustomizedDot />}
              activeDot={{ r: isMobile ? 5 : 8, strokeWidth: 2, stroke: '#fff', fill: '#3b82f6' }}
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
          <div className="p-4 sm:p-6 border-b border-blue-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm shadow-md border border-white/30">
                <Wind className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">Weather</h2>
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

          <nav className="flex-1 p-3 sm:p-4 space-y-1">
            <button 
              onClick={() => {
                setActiveTab('dashboard');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl transition-all font-medium text-sm ${activeTab === 'dashboard' ? 'bg-white/20 text-white shadow-lg border border-white/30 backdrop-blur-sm' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Home className="w-5 h-5" />
              <span>Dashboard</span>
            </button>
            
            <button 
              onClick={() => {
                setActiveTab('history');
                setSidebarOpen(false);
                setTimeout(() => {
                  historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl transition-all font-medium text-sm ${activeTab === 'history' ? 'bg-white/20 text-white shadow-lg border border-white/30 backdrop-blur-sm' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Clock className="w-5 h-5" />
              <span>History</span>
            </button>

            <div className="my-3 sm:my-4 border-t border-blue-500/30"></div>
            
            {!adminCheckLoading && isAdmin && (
              <>
                <div className="my-3 sm:my-4 border-t border-blue-500/30"></div>
                
                <button 
                  onClick={() => {
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-gradient-to-r from-yellow-400/20 to-amber-400/20 text-yellow-100 hover:from-yellow-400/30 hover:to-amber-400/30 transition-all font-medium text-sm border border-yellow-400/30 shadow-md"
                >
                  <Settings className="w-5 h-5" />
                  <span>Admin Panel</span>
                </button>
              </>
            )}
          </nav>

          <div className="p-3 sm:p-4 border-t border-blue-500/30">
            <button 
              onClick={() => {
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-all font-medium text-sm border border-red-400/30"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 sm:mb-8">
            <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-700 mb-2">Loading Weather Data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-10 max-w-md w-full">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
            <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-800 mb-2 sm:mb-3 text-center">Oops!</h2>
          <p className="text-gray-600 text-center mb-4 sm:mb-6">{error}</p>
          <div className="space-y-2 sm:space-y-3">
            <button 
              onClick={() => fetchWeatherData(containerName)}
              className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:from-red-600 hover:to-orange-700 transition-all duration-300 flex items-center justify-center font-bold text-sm sm:text-lg shadow-lg hover:shadow-xl"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredData = getFilteredData();
  const latestData = weatherData[weatherData.length - 1] || {};
  const lastReadingTime = getCombinedDateTime();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar />
      
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 truncate">
                  Dashboard
                </h1>
                <p className="text-xs text-gray-500">Real-time monitoring</p>
              </div>
            </div>
            
            <button 
              onClick={() => fetchWeatherData(containerName)}
              className="flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2 sm:px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <div className="p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md flex-shrink-0">
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-gray-800 truncate">{stationName}</h2>
                  <p className="text-xs text-gray-500">Weather Station</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 px-2 sm:px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                <div className="text-left text-xs sm:text-sm">
                  <p className="text-xs text-gray-500">Last update</p>
                  <p className="text-xs sm:text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 truncate">
                    {lastReadingTime}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-6 sm:mb-8">
            <StatCard 
              icon={Activity}
              title="Temp"
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
              title="Solar"
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
              title="Wind"
              value={latestData.avgWindSpeed}
              unit="km/h"
              gradient="from-blue-500 to-cyan-500"
            />
            
            <StatCard 
              icon={CloudRain}
              title="Rain"
              value={latestData.rainRatePerHour}
              unit="mm/h"
              gradient="from-cyan-500 to-blue-500"
            />
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6 mb-4 sm:mb-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                  <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-gray-800">Date Filter</h2>
                  <p className="text-xs text-gray-500 hidden sm:block">Select time range for charts</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {['1h', '6h', '24h', '7d', '30d', 'all'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTimeFilter(filter)}
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all ${
                      timeFilter === filter
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter === '1h' ? '1h' : filter === '6h' ? '6h' : filter === '24h' ? '24h' : filter === '7d' ? '7d' : '30d'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-8">
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

          <div ref={historyRef} className="bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
            <div className="p-3 sm:p-6 border-b border-gray-200">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 shadow-md">
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <h3 className="text-base sm:text-xl font-bold text-gray-800">Historical Data</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Time</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Temp</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Humidity</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden md:table-cell">S.I</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Wind</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden sm:table-cell">Dir</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Press</th>
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Rain</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {weatherData.slice().reverse().slice(0, showAllData ? weatherData.length : 5).map((row, index) => (
                    <tr key={index} className="hover:bg-blue-50 transition-colors duration-150">
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm font-semibold text-gray-900 whitespace-nowrap">
                        {row.time ? new Date(row.time).toLocaleTimeString() : 'N/A'}
                      </td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700">{typeof row.tempC === 'number' ? row.tempC.toFixed(1) : row.tempC}°</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700">{typeof row.humidity === 'number' ? row.humidity.toFixed(0) : row.humidity}%</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700 hidden md:table-cell">{typeof row.irradiance === 'number' ? row.irradiance.toFixed(0) : row.irradiance}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700">{typeof row.avgWindSpeed === 'number' ? row.avgWindSpeed.toFixed(1) : row.avgWindSpeed}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700 hidden sm:table-cell">{row.compassDir || '—'}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700 hidden lg:table-cell">{typeof row.pressure === 'number' ? row.pressure.toFixed(1) : row.pressure}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 text-xs sm:text-sm text-gray-700 hidden lg:table-cell">{typeof row.rainRatePerHour === 'number' ? row.rainRatePerHour.toFixed(2) : row.rainRatePerHour}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {weatherData.length > 5 && (
              <div className="p-3 sm:p-6 border-t border-gray-200 flex justify-center">
                <button
                  onClick={() => setShowAllData(!showAllData)}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm flex items-center gap-2"
                >
                  {showAllData ? (
                    <>
                      <ArrowLeft className="w-4 h-4" />
                      Show Less
                    </>
                  ) : (
                    <>
                      Show More ({weatherData.length - 5})
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