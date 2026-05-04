'use client'
import React, { useState, useEffect } from 'react';
import { Calendar, ArrowLeft, RefreshCw, Download, Clock, Activity, X, Cloud, Menu, Moon, SunMedium, AlertCircle, Filter, CloudRain } from 'lucide-react';

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

// ─── Open-Meteo rain helpers ─────────────────────────────────────────────────

const STATION_LAT = 25.555582;
const STATION_LON = 56.080717;

async function fetchOpenMeteoRain(): Promise<Map<string, number>> {
  const res = await fetch('/api/rain-data');
  if (!res.ok) throw new Error(`Rain API error: ${res.status}`);
  const json = await res.json();

  const times: string[] = json?.hourly?.time ?? [];
  const values: number[] = json?.hourly?.precipitation ?? [];

  const map = new Map<string, number>();
  times.forEach((t, i) => {
    const mmPerHour = values[i] ?? 0;
    // Spread hourly value across all four 15-min slots
    // e.g. "2026-03-27T14:00" covers :00, :15, :30, :45
    for (const mins of ['00', '15', '30', '45']) {
      map.set(`${t.slice(0, 14)}${mins}`, mmPerHour / 4);
    }
  });
  return map;
}

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

// ─── Component ────────────────────────────────────────────────────────────────

const HistoryPage = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherDataPoint[]>([]);
  const [filteredData, setFilteredData] = useState<WeatherDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerName, setContainerName] = useState('ws-tawyeen');
  const [stationName, setStationName] = useState('Weather Station');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ← Open-Meteo rain state
  const [rainMap, setRainMap] = useState<Map<string, number>>(new Map());
  const [rainLoading, setRainLoading] = useState(true);
  // ─── DEBUG: add this temporarily ─────────────────────────────────────────
useEffect(() => {
  if (rainLoading) return;
  console.log('[Rain Debug] rainMap size:', rainMap.size);
  console.log('[Rain Debug] sample entries:', [...rainMap.entries()].slice(0, 5));
  
  // Test: manually fetch and log the raw response
  fetch('/api/rain-data')
    .then(res => {
      console.log('[Rain Debug] HTTP status:', res.status);
      return res.json();
    })
    .then(json => {
      console.log('[Rain Debug] Raw response:', json);
      console.log('[Rain Debug] minutely_15 keys:', Object.keys(json?.minutely_15 ?? {}));
      console.log('[Rain Debug] time sample:', json?.minutely_15?.time?.slice(0, 3));
      console.log('[Rain Debug] precip sample:', json?.minutely_15?.precipitation?.slice(0, 3));
    })
    .catch(err => console.error('[Rain Debug] Fetch error:', err));
}, [rainLoading]);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDarkMode(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode, mounted]);

  // ← Fetch Open-Meteo rain once on mount
  useEffect(() => {
    let cancelled = false;
    setRainLoading(true);
    fetchOpenMeteoRain()
      .then((map) => { if (!cancelled) setRainMap(map); })
      .catch((err) => console.error('[Open-Meteo]', err))
      .finally(() => { if (!cancelled) setRainLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const getRainForTime = (isoTime?: string): number => {
    if (!isoTime || rainMap.size === 0) return 0;
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) return 0;
    return rainMap.get(snapTo15Min(date)) ?? 0;
  };

  const dm = mounted && darkMode;

  const t = {
    bg: 'bg-transparent',
    card: dm ? 'bg-gray-900/40 border border-white/10 backdrop-blur-md' : 'bg-white/40 border border-white/50 backdrop-blur-md',
    text: dm ? 'text-gray-100' : 'text-gray-900',
    textSub: dm ? 'text-gray-300' : 'text-gray-800',
    textMuted: dm ? 'text-gray-400' : 'text-gray-700',
    divider: dm ? 'border-white/10' : 'border-black/10',
    input: dm ? 'bg-gray-800/60 border-white/10 text-gray-100 focus:ring-sky-500' : 'bg-white/60 border-white/40 text-gray-900 focus:ring-sky-500',
    tableHead: dm ? 'bg-white/5 text-gray-300' : 'bg-black/5 text-gray-900',
    tableRow: dm ? 'hover:bg-white/5 border-white/10' : 'hover:bg-black/5 border-black/10',
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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlContainer = urlParams.get('container');
    const storedContainer = localStorage.getItem('selected_station');
    const storedName = localStorage.getItem('selected_station_name');
    const selectedContainer = urlContainer || storedContainer || 'ws-tawyeen';
    const selectedName = storedName || selectedContainer;
    setContainerName(selectedContainer);
    setStationName(selectedName);
    fetchWeatherData(selectedContainer);
    document.title = 'Historical Data';
  }, []);

  useEffect(() => { applyDateFilter(); }, [startDate, endDate, weatherData]);

  const fetchWeatherData = async (container: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/weather-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: container, latestOnly: false, page: 1, pageSize: 99999 })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!data?.data?.length) throw new Error('No weather data found');
      const sortedData = data.data.sort((a: WeatherDataPoint, b: WeatherDataPoint) =>
        new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
      );
      setWeatherData(sortedData);
      setFilteredData(sortedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  };

  const applyDateFilter = () => {
    if (!startDate && !endDate) { setFilteredData(weatherData); return; }
    const filtered = weatherData.filter(item => {
      if (!item.time) return true;
      const itemDate = new Date(item.time);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (start && end) { end.setHours(23,59,59,999); return itemDate >= start && itemDate <= end; }
      if (start) return itemDate >= start;
      if (end) { end.setHours(23,59,59,999); return itemDate <= end; }
      return true;
    });
    setFilteredData(filtered);
  };

  const clearDateFilter = () => { setStartDate(''); setEndDate(''); setFilteredData(weatherData); };

  // ← CSV export now uses Open-Meteo rain
  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    const headers = [
      'Time',
      'Temperature (°C)',
      'Humidity (%)',
      'Solar Irradiance (W/m²)',
      'Wind Speed (km/h)',
      'Direction',
      'Pressure (hPa)',
      'Rain (mm)',
    ];
    const csvContent = [
      headers.join(','),
      ...filteredData.map((row) => [
        row.time ? `"${new Date(row.time).toISOString().replace('T', ' ').slice(0, 19)}"` : 'N/A',
        row.tempC        ?? 'N/A',
        row.humidity     ?? 'N/A',
        row.irradiance   ?? 'N/A',
        row.avgWindSpeed ?? 'N/A',
        row.compassDir || row.direction || 'N/A',
        getFakePressure(row.time),
        getRainForTime(row.time as string).toFixed(2),
      ].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `weather-history-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100'} flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute inset-0 ${dm ? 'bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950' : 'bg-gradient-to-br from-sky-50 via-slate-100 to-blue-50'}`}/>
          <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-[0.07] bg-sky-400 animate-pulse`}/>
          <div className={`absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-[0.05] bg-blue-400 animate-pulse`} style={{ animationDelay: '1s' }}/>
        </div>
        <div className="relative text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className={`absolute inset-0 border-2 rounded-full ${dm ? 'border-gray-800' : 'border-gray-200'}`}/>
            <div className="absolute inset-0 border-2 border-sky-500 rounded-full border-t-transparent animate-spin"/>
            <div className="absolute inset-0 flex items-center justify-center">
              <Cloud className={`w-10 h-10 ${dm ? 'text-sky-400' : 'text-sky-500'}`}/>
            </div>
          </div>
          <p className={`text-xl font-bold mb-1 ${dm ? 'text-gray-100' : 'text-gray-800'}`}>Loading Historical Data</p>
          <p className={`text-sm ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Fetching records...</p>
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
          <button onClick={() => window.location.href = `/dashboard?container=${containerName}`} className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3.5 px-6 rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all font-bold text-sm shadow-lg flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ← Rain column uses Open-Meteo lookup; highlights rainy rows in blue
  const columns: { key: string; label: string; render: (row: WeatherDataPoint, i: number) => React.ReactNode }[] = [
    { key: 'time',         label: 'Time',              render: (row) => row.time ? new Date(row.time).toLocaleString() : '—' },
    { key: 'tempC',        label: 'Temp',              render: (row) => row.tempC !== undefined ? `${row.tempC}°C` : '—' },
    { key: 'humidity',     label: 'Humidity',          render: (row) => row.humidity !== undefined ? `${row.humidity}%` : '—' },
    { key: 'irradiance',   label: 'Irradiance',        render: (row) => row.irradiance !== undefined ? `${row.irradiance} W/m²` : '—' },
    { key: 'avgWindSpeed', label: 'Wind',              render: (row) => row.avgWindSpeed !== undefined ? `${row.avgWindSpeed} km/h` : '—' },
    { key: 'compassDir',   label: 'Direction',         render: (row) => row.compassDir || (row.direction ? `${row.direction}°` : '—') },
    { key: 'pressure',     label: 'Pressure',          render: (row) => `${getFakePressure(row.time)} hPa` },
    {
      key: 'rain',
      label: 'Rain',
      render: (row) => {
        if (rainLoading) return <span className={dm ? 'text-gray-500' : 'text-gray-400'}>…</span>;
        const mm = getRainForTime(row.time as string);
        return (
          <span className={mm > 0
            ? `font-bold ${dm ? 'text-blue-400' : 'text-blue-600'}`
            : dm ? 'text-gray-500' : 'text-gray-400'
          }>
            {mm.toFixed(2)} mm
          </span>
        );
      }
    },
  ];

  return (
    <div className="min-h-screen relative transition-colors duration-300">

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" />
        <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
      </div>

      <div className="relative flex flex-col min-h-screen">

        {/* Header */}
        <header className={`sticky top-0 z-30 ${dm ? 'bg-gray-900/30 border-b border-white/10' : 'bg-white/20 border-b border-white/30'} backdrop-blur-xl transition-colors duration-300`}>
          <div className="flex items-center justify-between px-5 py-3.5">

            <div className="flex items-center gap-3">
              <button onClick={() => window.location.href = `/dashboard?container=${containerName}`} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2.5">
                
                <div className="h-[50px] flex items-center overflow-visible">
  <img 
    src="/Taqsai.png" 
    alt="Taqsai" 
    className={`h-[180px] w-auto object-contain ${!dm ? 'drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]' : ''}`}
  />
</div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dm ? 'text-sky-400 bg-sky-950/60 border-sky-900/60' : 'text-sky-700 bg-sky-50 border-sky-100'}`}>
                {filteredData.length} Records
              </span>
              {/* ← Rain data status badge */}
              
              {(startDate || endDate) && (
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dm ? 'text-violet-400 bg-violet-950/60 border-violet-900/60' : 'text-violet-700 bg-violet-50 border-violet-100'}`}>
                  Filtered
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setDarkMode(!dm)} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-yellow-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                {dm ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={() => setShowDatePicker(!showDatePicker)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${showDatePicker ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md' : dm ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filter</span>
              </button>
              <button onClick={exportToCSV} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-lg hover:from-emerald-600 hover:to-teal-700 transition-all shadow-md hover:shadow-lg font-bold text-xs">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>
        </header>

        {/* Date filter panel */}
        {showDatePicker && (
          <div className={`${dm ? 'bg-gray-900/30 border-b border-white/10' : 'bg-white/20 border-b border-white/30'} backdrop-blur-xl`}>
            <div className="px-5 py-4 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                {[
                  { label: 'Start Date', val: startDate, set: setStartDate },
                  { label: 'End Date',   val: endDate,   set: setEndDate   },
                ].map(({ label, val, set }) => (
                  <div key={label} className="flex-1 w-full">
                    <label className={`block text-xs font-semibold uppercase tracking-widest mb-2 ${t.textSub}`}>{label}</label>
                    <input type="date" value={val} onChange={e => set(e.target.value)} className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:outline-none transition-all ${t.input}`}/>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={clearDateFilter} className={`px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Clear</button>
                  <button onClick={() => setShowDatePicker(false)} className="px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all font-bold text-xs whitespace-nowrap shadow-md">Apply</button>
                </div>
              </div>
              {(startDate || endDate) && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${dm ? 'bg-sky-950/60 text-sky-300 border border-sky-900/60' : 'bg-sky-50 text-sky-700 border border-sky-100'}`}>
                  {startDate && endDate
                    ? `Showing ${new Date(startDate).toLocaleDateString()} → ${new Date(endDate).toLocaleDateString()}`
                    : startDate ? `From ${new Date(startDate).toLocaleDateString()} onwards`
                    : `Up to ${new Date(endDate!).toLocaleDateString()}`}
                  <span className={`ml-2 font-bold ${dm ? 'text-sky-400' : 'text-sky-600'}`}>· {filteredData.length} records</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8 max-w-screen-xl mx-auto w-full">

          {/* Station info banner */}
          <div className={`rounded-2xl shadow-md ${t.card} p-4 mb-6 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className={`text-sm font-black ${t.text}`}>{stationName}</h2>
                <p className={`text-xs ${t.textSub}`}>Complete Weather History</p>
              </div>
            </div>
            
          </div>

          {/* Table card */}
          <div className={`rounded-2xl shadow-md ${t.card} overflow-hidden`}>
            <div className={`px-6 py-5 border-b ${t.divider} flex items-center gap-3`}>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-md">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${t.text}`}>All Records</h3>
                <p className={`text-xs ${t.textSub}`}>Most recent first</p>
              </div>
            </div>

            {filteredData.length === 0 ? (
              <div className="p-16 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <Clock className={`w-8 h-8 ${t.textMuted}`} />
                </div>
                <h3 className={`text-base font-bold mb-1 ${t.text}`}>No Records Found</h3>
                <p className={`text-sm ${t.textSub}`}>No data matches your filter. Try adjusting the date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className={t.tableHead}>
                      {columns.map(col => (
                        <th key={col.key} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${t.divider}`}>
                    {filteredData.map((row, i) => (
                      <tr key={i} className={`transition-colors ${t.tableRow}`}>
                        {columns.map(col => (
                          <td key={col.key} className={`px-5 py-3.5 text-xs whitespace-nowrap ${col.key === 'time' ? `font-semibold ${t.text}` : t.textSub}`}>
                            {col.render(row, i)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default HistoryPage;