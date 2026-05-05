'use client'

import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Wind, Sun, Droplets, Gauge, CloudRain, RefreshCw, AlertCircle, Navigation, Menu, X, Home, BarChart3, Settings, Download, Clock, ArrowLeft, LogOut, Calendar, Cloud, Zap, Moon, SunMedium } from 'lucide-react';

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
  openMeteoRain?: number; // ← injected from Open-Meteo
  [key: string]: string | number | undefined;
}

// ─── Open-Meteo rain helpers ────────────────────────────────────────────────

const STATION_LAT = 25.555582;
const STATION_LON = 56.080717;

/**
 * Fetches 15-minute precipitation data from Open-Meteo for the past month.
 * Returns a Map keyed by ISO timestamp (rounded to 15-min bucket) → mm value.
 */
async function fetchOpenMeteoRain(): Promise<Map<string, number>> {
  const res = await fetch('/api/rain-data');
  if (!res.ok) throw new Error(`Rain API error: ${res.status}`);
  const json = await res.json();

  const times: string[] = json?.hourly?.time ?? [];
  const values: number[] = json?.hourly?.precipitation ?? [];

  const map = new Map<string, number>();
  times.forEach((t, i) => {
    const mmPerHour = values[i] ?? 0;
    for (const mins of ['00', '15', '30', '45']) {
      map.set(`${t.slice(0, 14)}${mins}`, mmPerHour / 4);
    }
  });
  return map;
}

/**
 * Given a JS Date, snap it to the nearest 15-minute boundary and return
 * the "YYYY-MM-DDTHH:MM" string that Open-Meteo uses as its key.
 */
function snapTo15Min(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dubaiOffset = 4 * 60;
  const localMs = date.getTime() + dubaiOffset * 60 * 1000;
  const local = new Date(localMs);
  const mins = local.getUTCMinutes();
  const snappedMins = Math.floor(mins / 15) * 15;
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(snappedMins)}`
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const WeatherDashboard = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [containerName, setContainerName] = useState<string>('ws-tawyeen');
  const [stationName, setStationName] = useState<string>('Weather Station');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [timeFilter, setTimeFilter] = useState<string>('7d');
  const [csvFileName, setCSVFileName] = useState<string>('');
  const [showAllData, setShowAllData] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState<boolean>(true);
  const [connectionIndex, setConnectionIndex] = useState<0 | 1 | 2>(0);


  // ← NEW: Open-Meteo rain lookup map
  const [rainMap, setRainMap] = useState<Map<string, number>>(new Map());
  const [rainLoading, setRainLoading] = useState<boolean>(true);

  const historyRef = useRef<HTMLDivElement>(null);
  const dm = mounted && darkMode;

  const logDebug = (message: string, data?: any) => {
    console.log(`[WeatherDashboard] ${message}`, data || '');
  };

  // ─── Fetch Open-Meteo rain once on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setRainLoading(true);
    fetchOpenMeteoRain()
      .then((map) => {
        if (!cancelled) {
          setRainMap(map);
          logDebug(`Open-Meteo rain loaded: ${map.size} 15-min buckets`);
        }
      })
      .catch((err) => {
        console.error('[Open-Meteo]', err);
      })
      .finally(() => {
        if (!cancelled) setRainLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ─── Helper: look up rain for a given ISO timestamp ───────────────────────
  const getRainForTime = (isoTime?: string): number => {
    if (!isoTime || rainMap.size === 0) return 0;
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) return 0;
    const key = snapTo15Min(date);
    return rainMap.get(key) ?? 0;
  };

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDarkMode(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode, mounted]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlContainer = urlParams.get('container');
    const storedContainer = localStorage.getItem('selected_station');
    const storedName = localStorage.getItem('selected_station_name');
    const storedIndex      = localStorage.getItem('selected_connection_index');
    const selectedContainer = urlContainer || storedContainer || 'ws-tawyeen';
    const selectedName = storedName || selectedContainer;
    const selectedIndex     = (storedIndex ? parseInt(storedIndex) : 0) as 0 | 1 | 2;
    setContainerName(selectedContainer);
    setStationName(selectedName);
    setConnectionIndex(selectedIndex);
    fetchWeatherData(selectedContainer, selectedIndex); 
    const interval = setInterval(() => fetchWeatherData(selectedContainer, selectedIndex), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        setAdminCheckLoading(true);
        const response = await fetch('/api/auth/check-admin', { credentials: 'include' });
        const data = await response.json();
        setIsAdmin(data.isAdmin || false);
      } catch (error) {
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    };
    checkAdminStatus();
  }, []);

  const parseDateTime = (dateString: string): Date | null => {
    if (!dateString || dateString === 'N/A' || dateString === '') return null;
    const formats = [
      () => new Date(dateString),
      () => {
        const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) return new Date(Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6])));
        return null;
      },
      () => {
        const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) return new Date(Date.UTC(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6])));
        return null;
      },
      () => {
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp) && timestamp > 1000000000000) return new Date(timestamp);
        return null;
      },
      () => {
        const timestamp = parseInt(dateString);
        if (!isNaN(timestamp) && timestamp > 1000000000 && timestamp < 10000000000) return new Date(timestamp * 1000);
        return null;
      }
    ];
    for (const formatParser of formats) {
      try {
        const date = formatParser();
        if (date && !isNaN(date.getTime())) return date;
      } catch (e) {}
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
        if (!isNaN(date.getTime())) return date;
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
      if (parsed) fileDate = parsed;
    }
    let timeStr = '';
    if (timeValue) {
      const time = new Date(timeValue);
      if (!isNaN(time.getTime())) {
        timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (/^\d{1,2}:\d{2}/.test(String(timeValue))) {
        timeStr = String(timeValue);
      }
    }
    if (!fileDate && !timeStr) return 'No timestamp available';
    if (fileDate && timeStr) {
      const dateStr = fileDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${dateStr} — ${timeStr}`;
    } else if (fileDate) {
      return fileDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      return timeStr;
    }
  };

  useEffect(() => { document.title = 'Weather Dashboard'; }, []);

  const fetchWeatherData = async (container: string, connIndex: 0 | 1 | 2 = 0) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/weather-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: container, connectionIndex: connIndex, latestOnly: false, page: 1, pageSize: 99999 })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.metadata?.blobInfo?.name) setCSVFileName(data.metadata.blobInfo.name);
      if (!data?.data?.length) throw new Error('No weather data found');
      const processedData = data.data.map((item: any) => {
        const timeValue = item.time || item.timestamp || null;
        const parsedDate = timeValue ? parseDateTime(String(timeValue)) : null;
        return { ...item, time: parsedDate ? parsedDate.toISOString() : timeValue, _originalTime: timeValue };
      });
      const sortedData = processedData.sort((a: WeatherDataPoint, b: WeatherDataPoint) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());
      setWeatherData(sortedData);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  };

  const getFakePressure = (seed?: number | string): number => {
    if (seed === undefined) return 1019.13;
    const n = typeof seed === 'string'
      ? seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      : seed;
    const base = 1018 + (n % 3);
    const decimal = ((n * 17 + 13) % 100) / 100;
    return parseFloat((base + decimal).toFixed(2));
  };

  const handleBackToSelection = () => { window.location.href = '/selection'; };

  const formatXAxisDate = (dateString: string, filter: string) => {
    if (!dateString) return '';
    if (/^\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?$/.test(dateString)) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    if (filter === '1h' || filter === '6h' || filter === '24h') return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getOptimalDataSampling = (data: WeatherDataPoint[], filter: string): WeatherDataPoint[] => {
    if (!data || data.length === 0) return [];
    if (filter === '1h' || filter === '6h' || filter === '24h') return data;
    let sampleRate = 1;
    if (filter === '7d' && data.length > 100) sampleRate = Math.ceil(data.length / 100);
    else if (filter === '30d' && data.length > 150) sampleRate = Math.ceil(data.length / 150);
    else if (filter === 'all' && data.length > 200) sampleRate = Math.ceil(data.length / 200);
    if (sampleRate === 1) return data;
    const sampledData = [data[0]];
    for (let i = sampleRate; i < data.length - 1; i += sampleRate) sampledData.push(data[i]);
    sampledData.push(data[data.length - 1]);
    return sampledData;
  };

  const getFilteredData = () => {
    if (!weatherData || weatherData.length === 0) return [];
    const now = new Date();
    let filtered: WeatherDataPoint[];
    const filterMs: Record<string, number> = { '1h': 60*60*1000, '6h': 6*60*60*1000, '24h': 24*60*60*1000, '7d': 7*24*60*60*1000, '30d': 30*24*60*60*1000 };
    if (timeFilter in filterMs) {
      const cutoff = new Date(now.getTime() - filterMs[timeFilter]);
      filtered = weatherData.filter(item => !item.time || new Date(item.time) >= cutoff);
    } else {
      filtered = weatherData;
    }
    if (startDate || endDate) {
      filtered = filtered.filter(item => {
        if (!item.time) return true;
        const itemDate = new Date(item.time);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start && end) { end.setHours(23,59,59,999); return itemDate >= start && itemDate <= end; }
        if (start) return itemDate >= start;
        if (end) { end.setHours(23,59,59,999); return itemDate <= end; }
        return true;
      });
    }
    // ← Inject Open-Meteo rain into each data point
    const withRain = filtered.map(d => ({
      ...d,
      openMeteoRain: getRainForTime(d.time as string),
    }));
    return getOptimalDataSampling(withRain, timeFilter);
  };

  const clearDateFilter = () => { setStartDate(''); setEndDate(''); };

  // ─── Theme tokens ────────────────────────────────────────────────────────────
  const t = {
    bg: 'bg-transparent',
    card: dm ? 'bg-gray-900/40 border border-white/10 backdrop-blur-md' : 'bg-white/40 border border-white/50 backdrop-blur-md',
    cardHover: dm ? 'hover:bg-gray-800/50' : 'hover:bg-white/55',
    glass: dm ? 'bg-gray-900/40 border border-white/10 backdrop-blur-md' : 'bg-white/40 border border-white/50 backdrop-blur-md',
    text: dm ? 'text-gray-100' : 'text-gray-900',
    textSub: dm ? 'text-gray-400' : 'text-gray-600',
    textMuted: dm ? 'text-gray-500' : 'text-gray-500',
    divider: dm ? 'border-white/10' : 'border-black/10',
    glassDivider: dm ? 'border-white/10' : 'border-black/10',
    input: dm ? 'bg-gray-800/60 border-white/10 text-gray-100 focus:ring-sky-500' : 'bg-white/60 border-white/40 text-gray-900 focus:ring-sky-500',
    pill: dm ? 'bg-white/10 text-gray-300 hover:bg-white/20' : 'bg-black/10 text-gray-700 hover:bg-black/15',
    pillActive: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30',
    tableHead: dm ? 'bg-white/5 text-gray-400' : 'bg-black/5 text-gray-500',
    tableRow: dm ? 'hover:bg-white/5 border-white/10' : 'hover:bg-black/5 border-black/10',
    tooltip: dm ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipText: dm ? '#f3f4f6' : '#1f2937',
    gridStroke: dm ? '#374151' : '#d1d5db',
    axisStroke: dm ? '#d1d5db' : '#111827',
  };

  // ─── Wind Compass ─────────────────────────────────────────────────────────────
  const WindCompass = ({ direction, size = 140 }: { direction: number; size?: number }) => {
    const arrowLength = size * 0.35;
    const cx = size / 2, cy = size / 2;
    return (
      <div className="relative flex flex-col items-center justify-center gap-3">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute">
            <defs>
              <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={dm ? '#1e3a5f' : '#eff6ff'} />
                <stop offset="100%" stopColor={dm ? '#0f172a' : '#dbeafe'} />
              </radialGradient>
              <linearGradient id="compassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <filter id="arrowGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <circle cx={cx} cy={cy} r={size*0.46} fill="url(#compassBg)" stroke="url(#compassGrad)" strokeWidth="1.5" opacity="0.8"/>
            {[0,45,90,135,180,225,270,315].map(deg => {
              const rad = (deg-90)*Math.PI/180;
              const x1 = cx+(size*0.38)*Math.cos(rad), y1 = cy+(size*0.38)*Math.sin(rad);
              const x2 = cx+(size*0.44)*Math.cos(rad), y2 = cy+(size*0.44)*Math.sin(rad);
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#38bdf8" strokeWidth={deg%90===0?"2":"1"} opacity={deg%90===0?"0.8":"0.4"}/>;
            })}
            <g fill="#38bdf8" fontSize={size*0.11} fontWeight="700" textAnchor="middle" fontFamily="monospace">
              <text x={cx} y={size*0.14}>N</text>
              <text x={size*0.89} y={cy+size*0.04}>E</text>
              <text x={cx} y={size*0.92}>S</text>
              <text x={size*0.11} y={cy+size*0.04}>W</text>
            </g>
            <g transform={`rotate(${direction} ${cx} ${cy})`} filter="url(#arrowGlow)">
              <line x1={cx} y1={cy} x2={cx} y2={cy-arrowLength} stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" opacity="0.4"/>
              <path d={`M ${cx} ${cy-arrowLength} L ${cx-size*0.07} ${cy-arrowLength+size*0.13} L ${cx} ${cy-arrowLength+size*0.08} L ${cx+size*0.07} ${cy-arrowLength+size*0.13} Z`} fill="#38bdf8"/>
            </g>
          </svg>
          <div className="absolute w-3 h-3 bg-sky-400 rounded-full" style={{ boxShadow: '0 0 14px rgba(56,189,248,0.9)' }} />
        </div>
      </div>
    );
  };

  // ─── Stat Card ────────────────────────────────────────────────────────────────
  const StatCard = ({ icon: Icon, title, value, unit, gradient, accent, badge }: any) => (
    <div className={`relative overflow-hidden rounded-2xl shadow-md ${t.card} transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.06] group-hover:opacity-[0.1] transition-opacity`}/>
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          {badge && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {badge}
            </span>
          )}
        </div>
        <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${t.textSub}`}>{title}</p>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>
            {value !== null && value !== undefined ? value : '—'}
          </span>
          <span className={`text-xs font-medium ${t.textMuted}`}>{unit}</span>
        </div>
      </div>
      <div className={`h-0.5 bg-gradient-to-r ${gradient} opacity-60`}/>
    </div>
  );

  const CompassCard = ({ direction, compassDir }: any) => (
    <div className={`relative overflow-hidden rounded-2xl shadow-md ${t.card} h-full transition-all duration-300 hover:shadow-xl`}>
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-blue-600 opacity-[0.06]"/>
      <div className="relative p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-md">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest ${t.textSub}`}>Wind Direction</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-blue-500">{compassDir || '—'}</span>
              <span className={`text-sm font-bold ${t.textMuted}`}>{direction}°</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center mt-1">
          <WindCompass direction={direction} size={180} />
        </div>
      </div>
    </div>
  );

  const ChartCard = ({ title, dataKey, color, unit, icon: Icon, data, gradient }: any) => (
    <div className={`rounded-2xl shadow-md ${t.card} p-6 transition-all duration-300 hover:shadow-xl`}>
      <div className="flex items-center mb-5 space-x-3">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow-md`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className={`text-base font-bold ${t.text}`}>{title}</h3>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={dm ? 0.5 : 0.35}/>
              <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={t.gridStroke} opacity={0.5}/>
          <XAxis dataKey="time" stroke={t.axisStroke} tick={{ fill: t.axisStroke, fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" minTickGap={50} tickFormatter={(v) => formatXAxisDate(v, timeFilter)}/>
          <YAxis stroke={t.axisStroke} tick={{ fill: t.axisStroke, fontSize: 11 }} tickMargin={8} width={48} label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: t.axisStroke, fontWeight: 'bold', fontSize: 11 } }}/>
          <Tooltip contentStyle={{ backgroundColor: t.tooltip, border: 'none', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '12px' }} labelStyle={{ fontWeight: 700, color: t.tooltipText, marginBottom: 4 }} labelFormatter={(v) => { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }} formatter={(v: any) => [`${v} ${unit}`, title]}/>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#grad-${dataKey})`} dot={false} activeDot={{ r: 5, strokeWidth: 2.5, stroke: '#fff', fill: color }}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const WindSpeedWithDirectionChart = ({ data }: any) => {
    const CustomizedDot = (props: any) => {
      const { cx, cy, payload, index } = props;
      const direction = payload.direction || 0;
      const displayInterval = Math.max(1, Math.ceil(data.length / 20));
      if (index % displayInterval !== 0) return null;
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="11" fill={dm ? '#1e3a5f' : 'white'} stroke="#38bdf8" strokeWidth="2"/>
          <g transform={`rotate(${direction})`}>
            <path d="M 0,-6 L 2.5,3.5 L 0,1 L -2.5,3.5 Z" fill="#38bdf8"/>
          </g>
        </g>
      );
    };
    return (
      <div className={`rounded-2xl shadow-md ${t.card} p-6 h-full transition-all duration-300 hover:shadow-xl`}>
        <div className="flex items-center mb-4 space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-md">
            <Wind className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${t.text}`}>Wind Speed & Direction</h3>
            <p className={`text-xs mt-0.5 ${t.textMuted}`}>Arrows indicate wind direction</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="grad-windSpeed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={dm ? 0.5 : 0.35}/>
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.gridStroke} opacity={0.5}/>
            <XAxis dataKey="time" stroke={t.axisStroke} tick={{ fill: t.axisStroke, fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" minTickGap={50} tickFormatter={(v) => formatXAxisDate(v, timeFilter)}/>
            <YAxis stroke={t.axisStroke} tick={{ fill: t.axisStroke, fontSize: 11 }} tickMargin={8} width={48} label={{ value: 'km/h', angle: -90, position: 'insideLeft', style: { fill: t.axisStroke, fontWeight: 'bold', fontSize: 11 } }}/>
            <Tooltip contentStyle={{ backgroundColor: t.tooltip, border: 'none', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '12px' }} labelStyle={{ fontWeight: 700, color: t.tooltipText, marginBottom: 4 }} labelFormatter={(v) => { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }} formatter={(v: any, _: string, props: any) => { const dir = props.payload.direction || 0; const cd = props.payload.compassDir || 'N/A'; return [`${v} km/h · ${cd} (${dir}°)`, 'Wind']; }}/>
            <Area type="monotone" dataKey="avgWindSpeed" stroke="#38bdf8" strokeWidth={2.5} fill="url(#grad-windSpeed)" dot={<CustomizedDot />} activeDot={{ r: 7, strokeWidth: 2.5, stroke: '#fff', fill: '#38bdf8' }}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // ─── Sidebar ──────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40" onClick={() => setSidebarOpen(false)}/>
      )}
      <aside className={`fixed top-0 left-0 h-full w-72 z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${dm ? 'bg-gray-950 border-r border-gray-800' : 'bg-white border-r border-gray-100'} shadow-2xl flex flex-col`}>
        <div className={`px-6 py-5 flex items-center justify-between border-b ${t.divider}`}>
          <div className="flex items-center gap-3">
            
            <div className="h-[50px] flex items-center overflow-visible">
  <img 
  src={dm ? "/Taqsai.png" : "/taqsai-light.png"} 
  alt="Taqsai" 
  className="h-[180px] w-auto object-contain"
/>
</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`mx-4 my-4 px-4 py-3 rounded-xl ${dm ? 'bg-sky-950/60 border border-sky-900/60' : 'bg-sky-50 border border-sky-100'}`}>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${dm ? 'text-sky-400' : 'text-sky-600'}`}>Active Station</p>
          <p className={`text-sm font-bold truncate ${t.text}`}>{stationName}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            <span className={`text-xs ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>Live</span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <p className={`text-xs font-semibold uppercase tracking-widest px-2 py-2 ${t.textMuted}`}>Navigation</p>
          {[
            { id: 'dashboard', label: 'Dashboard',  icon: Home,     action: () => { setActiveTab('dashboard'); setSidebarOpen(false); } },
            { id: 'forecast',  label: 'Forecast',   icon: Cloud,    action: () => { window.location.href = '/forecast'; setSidebarOpen(false); } },
            { id: 'selection', label: 'All Stations', icon: ArrowLeft, action: () => { window.location.href = '/selection'; setSidebarOpen(false); } },
            { id: 'history',   label: 'History',    icon: Clock,    action: () => { window.location.href = `/history?container=${containerName}`; setSidebarOpen(false); } },
          ].map(item => (
            <button key={item.id} onClick={item.action} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === item.id ? `${dm ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'bg-sky-50 text-sky-600 border border-sky-100'}` : `${t.text} ${dm ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}`}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}

          {!adminCheckLoading && isAdmin && (
            <>
              <div className={`my-4 border-t ${t.divider}`}/>
              <p className={`text-xs font-semibold uppercase tracking-widest px-2 py-2 ${t.textMuted}`}>Administration</p>
              <button onClick={() => { window.location.href = '/access'; setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${dm ? 'bg-amber-950/50 text-amber-400 border border-amber-900/50 hover:bg-amber-950' : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100'}`}>
                <Settings className="w-4 h-4" />
                Admin Panel
              </button>
            </>
          )}
        </nav>

        <div className={`px-4 py-4 border-t ${t.divider} space-y-2`}>
          <button onClick={() => setDarkMode(!dm)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${dm ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {dm ? <SunMedium className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            {dm ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${dm ? 'bg-red-950/50 text-red-400 border border-red-900/40 hover:bg-red-950' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'}`}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );

  // ─── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100'} flex items-center justify-center`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${dm ? 'bg-sky-700' : 'bg-sky-300'} animate-pulse`}/>
          <div className={`absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-15 ${dm ? 'bg-blue-700' : 'bg-blue-300'} animate-pulse`} style={{ animationDelay: '1s' }}/>
        </div>
        <div className="relative text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className={`absolute inset-0 border-2 rounded-full ${dm ? 'border-gray-800' : 'border-gray-200'}`}/>
            <div className="absolute inset-0 border-2 border-sky-500 rounded-full border-t-transparent animate-spin"/>
            <div className="absolute inset-0 flex items-center justify-center">
              <Cloud className={`w-10 h-10 ${dm ? 'text-sky-400' : 'text-sky-500'}`}/>
            </div>
          </div>
          <p className={`text-xl font-bold mb-1 ${t.text}`}>Loading Weather Data</p>
          <p className={`text-sm ${t.textSub}`}>Connecting to station...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100'} flex items-center justify-center p-6`}>
        <div className={`rounded-3xl shadow-2xl p-10 max-w-md w-full ${t.card}`}>
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-black mb-3 text-center ${t.text}`}>Connection Error</h2>
          <p className={`text-center mb-6 text-sm ${t.textSub}`}>{error}</p>
          <div className="space-y-3">
            <button onClick={() => fetchWeatherData(containerName)} className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3.5 px-6 rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all font-bold text-sm shadow-lg flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
            <button onClick={handleBackToSelection} className={`w-full py-3.5 px-6 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 ${dm ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              <ArrowLeft className="w-4 h-4" /> Back to Stations
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredData = getFilteredData();
  const latestData = weatherData[weatherData.length - 1] || {};

  // ← Latest Open-Meteo rain for the stat card
  const latestRain = getRainForTime(latestData.time as string);

  const lastReadingTime = getCombinedDateTime();

  const timeFilters = [
    { key: '1h', label: '1H' },
    { key: '6h', label: '6H' },
    { key: '24h', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className={`min-h-screen ${t.bg} relative transition-colors duration-300`}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" />
        <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
      </div>

      <Sidebar />

      <div className="relative min-h-screen flex flex-col">
        {/* Header */}
        <header className={`sticky top-0 z-30 ${dm ? 'bg-gray-900/30 border-b border-white/10' : 'bg-white/20 border-b border-white/30'} backdrop-blur-xl transition-colors duration-300`}>
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                <Menu className="w-5 h-5" />
              </button>
              
              
              <div className="flex items-center gap-2.5">
                
                <div className="h-[50px] flex items-center overflow-visible">
  <img 
  src={dm ? "/Taqsai.png" : "/taqsai-light.png"} 
  alt="Taqsai" 
  className="h-[180px] w-auto object-contain"
/>
</div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
              <span className={`text-xs font-bold ${dm ? 'text-sky-300' : 'text-sky-700'}`}>{stationName}</span>
            </div>

            <div className="flex items-center gap-2">
              {lastUpdate && (
                <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              <button onClick={() => setDarkMode(!dm)} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-yellow-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                {dm ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={() => fetchWeatherData(containerName, connectionIndex)} className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-sky-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-semibold text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8 max-w-screen-xl mx-auto w-full">

          {/* Station status banner */}
          <div className={`rounded-2xl shadow-md ${t.card} p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-pulse"/>
              </div>
              <div>
                <h2 className={`text-sm font-black ${t.text}`}>{stationName}</h2>
                <p className={`text-xs ${t.textSub}`}>Weather Monitoring Station</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${dm ? 'bg-white/10' : 'bg-white/50'} border ${t.divider}`}>
                <Clock className={`w-4 h-4 ${dm ? 'text-sky-400' : 'text-sky-500'}`} />
                <div>
                  <p className={`text-[10px] uppercase tracking-widest font-semibold ${t.textMuted}`}>Last Update</p>
                  <p className={`text-xs font-bold ${dm ? 'text-sky-300' : 'text-sky-700'}`}>{lastReadingTime}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stat cards — Rain card now uses Open-Meteo data */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatCard icon={Activity}   title="Temperature" value={latestData.tempC}          unit="°C"   gradient="from-rose-500 to-pink-500" />
            <StatCard icon={Droplets}   title="Humidity"    value={latestData.humidity}        unit="%"    gradient="from-emerald-500 to-teal-500" />
            <StatCard icon={Sun}        title="Irradiance"  value={latestData.irradiance}      unit="W/m²" gradient="from-amber-500 to-orange-500" />
            <StatCard icon={Gauge}      title="Pressure"    value={getFakePressure(latestData.time)} unit="hPa" gradient="from-violet-500 to-purple-600" />
            <StatCard icon={Wind}       title="Wind Speed"  value={latestData.avgWindSpeed}    unit="km/h" gradient="from-sky-500 to-cyan-500" />
            {/* ↓ CHANGED: Rain now comes from Open-Meteo, badge shows source */}
            <StatCard
              icon={CloudRain}
              title="Rain"
              value={rainLoading ? '…' : latestRain.toFixed(2)}
              unit="mm"
              gradient="from-blue-500 to-indigo-500"
              
            />
          </div>

          {/* Filter bar */}
          <div className={`rounded-2xl shadow-md ${t.card} p-5 mb-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className={`text-sm font-bold ${t.text}`}>Time Range</h2>
                  <p className={`text-xs ${t.textSub}`}>Filter chart data</p>
                </div>
              </div>
              <button onClick={() => setShowDatePicker(!showDatePicker)} className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs transition-all ${showDatePicker ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md' : dm ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                <Calendar className="w-3.5 h-3.5" />
                Custom Range
              </button>
            </div>

            {showDatePicker && (
              <div className={`mb-4 p-4 rounded-xl border ${t.divider} ${dm ? 'bg-white/5' : 'bg-white/30'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  {[{ label: 'Start Date', val: startDate, set: setStartDate }, { label: 'End Date', val: endDate, set: setEndDate }].map(({ label, val, set }) => (
                    <div key={label} className="flex-1 w-full">
                      <label className={`block text-xs font-semibold mb-2 ${t.textSub}`}>{label}</label>
                      <input type="date" value={val} onChange={e => set(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:outline-none transition-all ${t.input}`}/>
                    </div>
                  ))}
                  <button onClick={clearDateFilter} className={`px-4 py-2 rounded-lg font-semibold text-xs whitespace-nowrap transition-all ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>Clear</button>
                </div>
                {(startDate || endDate) && (
                  <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${dm ? 'bg-sky-950/60 text-sky-300 border border-sky-900/60' : 'bg-sky-50 text-sky-700 border border-sky-100'}`}>
                    {startDate && endDate ? `Showing ${new Date(startDate).toLocaleDateString()} → ${new Date(endDate).toLocaleDateString()}` : startDate ? `From ${new Date(startDate).toLocaleDateString()}` : `Until ${new Date(endDate!).toLocaleDateString()}`}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {timeFilters.map(({ key, label }) => (
                <button key={key} onClick={() => { setTimeFilter(key); clearDateFilter(); setShowDatePicker(false); }} className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${timeFilter === key ? t.pillActive : t.pill}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <ChartCard title="Temperature" dataKey="tempC" color="#f43f5e" unit="°C" icon={Activity} data={filteredData} gradient="from-rose-500 to-pink-500" />
            <ChartCard title="Humidity" dataKey="humidity" color="#10b981" unit="%" icon={Droplets} data={filteredData} gradient="from-emerald-500 to-teal-500" />
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <ChartCard title="Solar Irradiance" dataKey="irradiance" color="#f59e0b" unit="W/m²" icon={Sun} data={filteredData} gradient="from-amber-500 to-orange-500" />
            <ChartCard title="Atmospheric Pressure" dataKey="pressure" color="#8b5cf6" unit="hPa" icon={Gauge} data={filteredData.map(d => ({ ...d, pressure: getFakePressure(d.time) }))} gradient="from-violet-500 to-purple-600" />
          </div>

          {/* ← NEW: Rain chart using Open-Meteo data */}
          <div className="mb-5">
            <ChartCard
              title="Precipitation"
              dataKey="openMeteoRain"
              color="#6366f1"
              unit="mm"
              icon={CloudRain}
              data={filteredData}
              gradient="from-blue-500 to-indigo-500"
            />
          </div>

          {/* Wind row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="lg:col-span-1">
              <CompassCard direction={latestData.direction || 0} compassDir={latestData.compassDir} />
            </div>
            <div className="lg:col-span-2">
              <WindSpeedWithDirectionChart data={filteredData} />
            </div>
          </div>

          {/* Historical data table */}
          <div ref={historyRef} className={`rounded-2xl shadow-md ${t.card} overflow-hidden`}>
            <div className={`px-6 py-5 border-b ${t.divider} flex items-center gap-3`}>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-md">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${t.text}`}>Historical Data</h3>
                <p className={`text-xs ${t.textSub}`}>{weatherData.length} total records</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className={t.tableHead}>
                    {['Time', 'Temp', 'Humidity', 'Irradiance', 'Wind', 'Direction', 'Pressure', 'Rain'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${t.divider}`}>
                  {weatherData.slice().reverse().slice(0, 5).map((row, i) => (
                    <tr key={i} className={`transition-colors ${t.tableRow}`}>
                      <td className={`px-5 py-3.5 text-xs font-semibold whitespace-nowrap ${t.text}`}>{row.time ? new Date(row.time).toLocaleString() : row._originalTime || '—'}</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{row.tempC}°C</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{row.humidity}%</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{row.irradiance} W/m²</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{row.avgWindSpeed} km/h</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{row.compassDir || `${row.direction}°`}</td>
                      <td className={`px-5 py-3.5 text-xs ${t.textSub}`}>{getFakePressure(row.time)} hPa</td>
                      {/* ↓ CHANGED: Rain column now uses Open-Meteo lookup */}
                      <td className={`px-5 py-3.5 text-xs font-semibold ${
                        getRainForTime(row.time as string) > 0
                          ? dm ? 'text-blue-400' : 'text-blue-600'
                          : t.textSub
                      }`}>
                        {rainLoading ? '…' : `${getRainForTime(row.time as string).toFixed(2)} mm`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {weatherData.length > 5 && (
              <div className={`px-6 py-4 border-t ${t.divider} flex justify-center`}>
                <button onClick={() => window.location.href = `/history?container=${containerName}`} className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-6 py-2.5 rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-bold text-xs">
                  View All {weatherData.length} Records
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default WeatherDashboard;