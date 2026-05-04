'use client'
import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Droplets,
  ArrowLeft, RefreshCw, MapPin, Moon, SunMedium,
  Gauge, CloudDrizzle, AlertCircle, Search, X, Activity
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CurrentWeather {
  temp: number;
  humidity: number;
  irradiance: number;
  windSpeed: number;
  windDir: number;
  weatherCode: number;
  rainRate: number;
  compassDir?: string;
}

interface HourlyForecast {
  time: string;
  temp: number;
  humidity: number;
  windSpeed: number;
  windDir: number;
  rainRate: number;
  weatherCode: number;
}

interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  humidity: number;
  windSpeedMax: number;
  rainSum: number;
  weatherCode: number;
}

interface Location {
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** If set, this location maps to a weather station container */
  stationContainer?: string;
  stationLabel?: string;
}

// ─── Fake pressure — identical to dashboard ───────────────────────────────────
const getFakePressure = (seed: string): number => {
  const n = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base    = 1018 + (n % 3);
  const decimal = ((n * 17 + 13) % 100) / 100;
  return parseFloat((base + decimal).toFixed(2));
};

// ─── WMO weather code helpers ─────────────────────────────────────────────────
const getWeatherInfo = (code: number) => {
  if (code === 0)  return { label: 'Clear Sky',     color: '#f59e0b', gradient: 'from-amber-400 to-orange-500'   };
  if (code <= 2)   return { label: 'Partly Cloudy', color: '#94a3b8', gradient: 'from-slate-400 to-slate-500'    };
  if (code === 3)  return { label: 'Overcast',      color: '#64748b', gradient: 'from-slate-500 to-slate-600'    };
  if (code <= 49)  return { label: 'Foggy',         color: '#94a3b8', gradient: 'from-slate-400 to-slate-500'    };
  if (code <= 57)  return { label: 'Drizzle',       color: '#38bdf8', gradient: 'from-sky-400 to-cyan-500'       };
  if (code <= 67)  return { label: 'Rain',          color: '#3b82f6', gradient: 'from-blue-400 to-blue-600'      };
  if (code <= 77)  return { label: 'Snow',          color: '#bfdbfe', gradient: 'from-slate-200 to-blue-200'     };
  if (code <= 82)  return { label: 'Rain Showers',  color: '#3b82f6', gradient: 'from-blue-400 to-indigo-500'   };
  if (code <= 86)  return { label: 'Snow Showers',  color: '#bfdbfe', gradient: 'from-blue-200 to-slate-300'    };
  return                  { label: 'Thunderstorm',  color: '#a855f7', gradient: 'from-purple-500 to-violet-600'  };
};

// Derive a simple WMO-ish weather code from station data
const stationWeatherCode = (rainRate: number, irradiance: number): number => {
  if (rainRate > 2) return 65;   // Heavy rain
  if (rainRate > 0.1) return 61; // Light rain
  if (irradiance > 500) return 0; // Clear sky
  if (irradiance > 100) return 1; // Mainly clear
  return 3; // Overcast / low sun
};

const WeatherIcon = ({ code, size = 24, color }: { code: number; size?: number; color?: string }) => {
  const s = { width: size, height: size, color };
  if (code === 0)  return <Sun style={s} />;
  if (code <= 3)   return <Cloud style={s} />;
  if (code <= 49)  return <Cloud style={s} />;
  if (code <= 57)  return <CloudDrizzle style={s} />;
  if (code <= 67)  return <CloudRain style={s} />;
  if (code <= 77)  return <CloudSnow style={s} />;
  if (code <= 82)  return <CloudRain style={s} />;
  if (code <= 86)  return <CloudSnow style={s} />;
  return <CloudLightning style={s} />;
};

const compassDir = (deg: number) =>
  ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];

const formatHour = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

const formatDay = (iso: string) => {
  // Split YYYY-MM-DD manually to avoid UTC-midnight → wrong local day in UTC+ timezones
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date  = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tom   = new Date(today); tom.setDate(today.getDate() + 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tom.getTime())   return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ─── Preset locations ─────────────────────────────────────────────────────────
// Tuwayain is first and default — tied to the ws-tawyeen station container
const PRESETS: Location[] = [
  { name: 'Tuwayain',    country: 'AE', lat: 25.0657, lon: 56.3786, stationContainer: 'ws-tawyeen', stationLabel: 'Tuwayain Weather Station' },
  { name: 'Fujairah',   country: 'AE', lat: 25.1288, lon: 56.3265 },
  { name: 'Dubai',      country: 'AE', lat: 25.2048, lon: 55.2708 },
  { name: 'Abu Dhabi',  country: 'AE', lat: 24.4539, lon: 54.3773 },
  { name: 'Sharjah',    country: 'AE', lat: 25.3463, lon: 55.4209 },
  { name: 'Ajman',      country: 'AE', lat: 25.4052, lon: 55.5136 },
  { name: 'Ras Al Khaimah', country: 'AE', lat: 25.7895, lon: 55.9432 },
  { name: 'Al Ain',     country: 'AE', lat: 24.2075, lon: 55.7447 },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function ForecastPage() {
  const [darkMode, setDarkMode]           = useState(false);
  const [mounted, setMounted]             = useState(false);
  const [current, setCurrent]             = useState<CurrentWeather | null>(null);
  const [hourly, setHourly]               = useState<HourlyForecast[]>([]);
  const [daily, setDaily]                 = useState<DailyForecast[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [location, setLocation]           = useState<Location>(PRESETS[0]);
  const [selectedDay, setSelectedDay]     = useState(0);
  const [lastUpdate, setLastUpdate]       = useState<Date | null>(null);
  const [showPicker, setShowPicker]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [searching, setSearching]         = useState(false);
  const [isStationData, setIsStationData]       = useState(false);
  const [hourlyForecast, setHourlyForecast]     = useState<HourlyForecast[]>([]);
  const [hourlyTab, setHourlyTab]               = useState<'forecast' | 'past'>('forecast');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDarkMode(true);
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode, mounted]);
  const dm = mounted && darkMode;

  const t = {
    card:      dm ? 'bg-gray-900/40 border border-white/10 backdrop-blur-md'
                  : 'bg-white/40 border border-white/50 backdrop-blur-md',
    cardSolid: dm ? 'bg-gray-900/60 border border-white/10 backdrop-blur-md'
                  : 'bg-white/60 border border-white/60 backdrop-blur-md',
    text:      dm ? 'text-gray-100'  : 'text-gray-900',
    textSub:   dm ? 'text-gray-400'  : 'text-gray-600',
    textMuted: dm ? 'text-gray-500'  : 'text-gray-500',
    divider:   dm ? 'border-white/10' : 'border-black/10',
    input:     dm ? 'bg-gray-800/80 border-white/10 text-gray-100 placeholder-gray-500'
                  : 'bg-white/80 border-black/10 text-gray-900 placeholder-gray-400',
    pill:      dm ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                  : 'bg-black/10 text-gray-700 hover:bg-black/15',
    pillActive: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg',
    inset:     dm ? 'bg-white/5' : 'bg-black/5',
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const searchLocation = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res  = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
      );
      const data = await res.json();
      setSearchResults(
        data.results
          ? data.results.map((r: any) => ({ name: r.name, country: r.country_code, lat: r.latitude, lon: r.longitude }))
          : []
      );
    } catch { setSearchResults([]); }
    finally   { setSearching(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => searchLocation(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Parse date from station data (same as dashboard) ──────────────────────
  const parseDateTime = (dateString: string): Date | null => {
    if (!dateString || dateString === 'N/A' || dateString === '') return null;
    const formats = [
      () => new Date(dateString),
      () => {
        const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) return new Date(Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6])));
        return null;
      },
    ];
    for (const fn of formats) {
      try { const d = fn(); if (d && !isNaN(d.getTime())) return d; } catch {}
    }
    return null;
  };

  // ── Fetch Open-Meteo hourly forecast for any lat/lon ─────────────────────
  const fetchHourlyForecast = async (lat: number, lon: number): Promise<HourlyForecast[]> => {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',  String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('hourly', [
      'temperature_2m','relative_humidity_2m','wind_speed_10m',
      'wind_direction_10m','weather_code','shortwave_radiation','rain',
    ].join(','));
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('timezone',        'auto');
    url.searchParams.set('forecast_days',   '2');
    const res  = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const nowH = new Date(); nowH.setMinutes(0, 0, 0);
    const h = data.hourly;
    const out: HourlyForecast[] = [];
    for (let i = 0; i < h.time.length; i++) {
      if (new Date(h.time[i]) >= nowH && out.length < 24) {
        out.push({
          time:        h.time[i],
          temp:        Math.round(h.temperature_2m[i]),
          humidity:    h.relative_humidity_2m[i],
          windSpeed:   Math.round(h.wind_speed_10m[i]),
          windDir:     h.wind_direction_10m[i],
          rainRate:    parseFloat((h.rain[i] ?? 0).toFixed(2)),
          weatherCode: h.weather_code[i],
        });
      }
    }
    return out;
  };

  // ── Fetch from weather station API ────────────────────────────────────────
  const fetchStationData = async (containerName: string) => {
    setLoading(true); setError(null); setIsStationData(true);
    try {
      const response = await fetch('/api/weather-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName, latestOnly: false, page: 1, pageSize: 99999 })
      });
      if (!response.ok) throw new Error(`Station API error: ${response.status}`);
      const data = await response.json();
      if (!data?.data?.length) throw new Error('No station data found');

      // Process & sort
      const processed = data.data.map((item: any) => {
        const tv = item.time || item.timestamp || null;
        const pd = tv ? parseDateTime(String(tv)) : null;
        return { ...item, time: pd ? pd.toISOString() : tv };
      }).sort((a: any, b: any) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());

      const latest = processed[processed.length - 1];

      // ── Current from latest record
      const rainRate   = parseFloat(latest.rainRatePerHour ?? 0);
      const irradiance = parseFloat(latest.irradiance ?? 0);
      setCurrent({
        temp:        parseFloat(latest.tempC ?? 0),
        humidity:    parseFloat(latest.humidity ?? 0),
        irradiance:  irradiance,
        windSpeed:   parseFloat(latest.avgWindSpeed ?? 0),
        windDir:     parseFloat(latest.direction ?? 0),
        weatherCode: stationWeatherCode(rainRate, irradiance),
        rainRate:    rainRate,
        compassDir:  latest.compassDir,
      });

      // ── Hourly — last 24 records as "hourly" (station may not have exact 1h cadence)
      const hourlyArr: HourlyForecast[] = processed.slice(-24).map((item: any) => {
        const rr = parseFloat(item.rainRatePerHour ?? 0);
        const ir = parseFloat(item.irradiance ?? 0);
        return {
          time:        item.time,
          temp:        parseFloat(item.tempC ?? 0),
          humidity:    parseFloat(item.humidity ?? 0),
          windSpeed:   parseFloat(item.avgWindSpeed ?? 0),
          windDir:     parseFloat(item.direction ?? 0),
          rainRate:    rr,
          weatherCode: stationWeatherCode(rr, ir),
        };
      });
      setHourly(hourlyArr);

      // ── Daily + hourly forecast — both from Open-Meteo for station coordinates
      const stationLoc = PRESETS.find(p => p.stationContainer === containerName);
      if (stationLoc) {
        // Fetch 7-day daily forecast
        const dailyUrl = new URL('https://api.open-meteo.com/v1/forecast');
        dailyUrl.searchParams.set('latitude',  String(stationLoc.lat));
        dailyUrl.searchParams.set('longitude', String(stationLoc.lon));
        dailyUrl.searchParams.set('daily', [
          'weather_code','temperature_2m_max','temperature_2m_min',
          'relative_humidity_2m_mean','wind_speed_10m_max','rain_sum',
        ].join(','));
        dailyUrl.searchParams.set('wind_speed_unit', 'kmh');
        dailyUrl.searchParams.set('timezone',        'auto');
        dailyUrl.searchParams.set('forecast_days',   '7');
        const dailyRes  = await fetch(dailyUrl.toString());
        if (dailyRes.ok) {
          const dailyData = await dailyRes.json();
          const d = dailyData.daily;
          setDaily(d.time.map((_: string, i: number) => ({
            date:         d.time[i],
            tempMax:      Math.round(d.temperature_2m_max[i]),
            tempMin:      Math.round(d.temperature_2m_min[i]),
            humidity:     Math.round(d.relative_humidity_2m_mean?.[i] ?? 0),
            windSpeedMax: Math.round(d.wind_speed_10m_max[i]),
            rainSum:      parseFloat((d.rain_sum[i] ?? 0).toFixed(2)),
            weatherCode:  d.weather_code[i],
          })));
        }

        // Fetch hourly forecast
        const forecast = await fetchHourlyForecast(stationLoc.lat, stationLoc.lon);
        setHourlyForecast(forecast);
      } else {
        setDaily([]);
        setHourlyForecast([]);
      }

      setHourlyTab('forecast'); // default to forecast tab
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch station data');
    } finally { setLoading(false); }
  };

  // ── Fetch from Open-Meteo ─────────────────────────────────────────────────
  const fetchForecast = async (loc: Location) => {
    setLoading(true); setError(null); setIsStationData(false);
    setHourlyForecast([]);
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude',  String(loc.lat));
      url.searchParams.set('longitude', String(loc.lon));
      url.searchParams.set('current', [
        'temperature_2m','relative_humidity_2m','wind_speed_10m',
        'wind_direction_10m','weather_code','shortwave_radiation','rain',
      ].join(','));
      url.searchParams.set('hourly', [
        'temperature_2m','relative_humidity_2m','wind_speed_10m',
        'wind_direction_10m','weather_code','shortwave_radiation','rain',
      ].join(','));
      url.searchParams.set('daily', [
        'weather_code','temperature_2m_max','temperature_2m_min',
        'relative_humidity_2m_mean','wind_speed_10m_max','rain_sum',
      ].join(','));
      url.searchParams.set('wind_speed_unit', 'kmh');
      url.searchParams.set('timezone',        'auto');
      url.searchParams.set('forecast_days',   '7');

      const res  = await fetch(url.toString());
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const c = data.current;
      setCurrent({
        temp:        Math.round(c.temperature_2m),
        humidity:    c.relative_humidity_2m,
        irradiance:  Math.round(c.shortwave_radiation ?? 0),
        windSpeed:   Math.round(c.wind_speed_10m),
        windDir:     c.wind_direction_10m,
        weatherCode: c.weather_code,
        rainRate:    parseFloat((c.rain ?? 0).toFixed(2)),
      });

      const nowH = new Date(); nowH.setMinutes(0, 0, 0);
      const h = data.hourly;
      const hourlyArr: HourlyForecast[] = [];
      for (let i = 0; i < h.time.length; i++) {
        if (new Date(h.time[i]) >= nowH && hourlyArr.length < 24) {
          hourlyArr.push({
            time:        h.time[i],
            temp:        Math.round(h.temperature_2m[i]),
            humidity:    h.relative_humidity_2m[i],
            windSpeed:   Math.round(h.wind_speed_10m[i]),
            windDir:     h.wind_direction_10m[i],
            rainRate:    parseFloat((h.rain[i] ?? 0).toFixed(2)),
            weatherCode: h.weather_code[i],
          });
        }
      }
      setHourly(hourlyArr);

      const d = data.daily;
      setDaily(d.time.map((_: string, i: number) => ({
        date:         d.time[i],
        tempMax:      Math.round(d.temperature_2m_max[i]),
        tempMin:      Math.round(d.temperature_2m_min[i]),
        humidity:     Math.round(d.relative_humidity_2m_mean?.[i] ?? 0),
        windSpeedMax: Math.round(d.wind_speed_10m_max[i]),
        rainSum:      parseFloat((d.rain_sum[i] ?? 0).toFixed(2)),
        weatherCode:  d.weather_code[i],
      })));

      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forecast');
    } finally { setLoading(false); }
  };

  // ── Route to correct source based on location ─────────────────────────────
  const loadWeather = (loc: Location) => {
    if (loc.stationContainer) {
      fetchStationData(loc.stationContainer);
    } else {
      fetchForecast(loc);
    }
  };

  useEffect(() => {
    document.title = 'Weather Forecast';
    loadWeather(location);
  }, [location]);

  const selectLocation = (loc: Location) => {
    setLocation(loc);
    setShowPicker(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedDay(0);
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
      </div>
      <div className="relative text-center">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className={`absolute inset-0 border-2 rounded-full ${dm ? 'border-gray-800' : 'border-gray-200'}`} />
          <div className="absolute inset-0 border-2 border-sky-500 rounded-full border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Cloud className={`w-10 h-10 ${dm ? 'text-sky-400' : 'text-sky-500'}`} />
          </div>
        </div>
        <p className={`text-xl font-bold mb-1 ${dm ? 'text-gray-100' : 'text-gray-800'}`}>Loading Forecast</p>
        <p className={`text-sm ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
          {location.stationContainer ? `Reading from ${location.stationLabel ?? location.name} station...` : `Fetching weather for ${location.name}...`}
        </p>
      </div>
    </div>
  );

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="fixed inset-0 pointer-events-none">
        <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
      </div>
      <div className={`relative rounded-3xl shadow-2xl p-10 max-w-md w-full ${t.card}`}>
        <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-white" />
        </div>
        <h2 className={`text-2xl font-black mb-3 text-center ${t.text}`}>Fetch Error</h2>
        <p className={`text-center mb-6 text-sm ${t.textSub}`}>{error}</p>
        <button onClick={() => loadWeather(location)}
          className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3.5 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    </div>
  );

  const info       = current ? getWeatherInfo(current.weatherCode) : null;
  const todayDaily = daily[selectedDay];
  const nowSeed    = new Date().toISOString().slice(0, 13);

  return (
    <div className="min-h-screen relative transition-colors duration-300">

      {/* ── Background ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Header ── */}
        <header className={`sticky top-0 z-30 ${dm ? 'bg-gray-900/30 border-b border-white/10' : 'bg-white/20 border-b border-white/30'} backdrop-blur-xl`}>
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => window.history.back()}
                className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
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

            {/* Location chip — shows station badge when using station data */}
            <button onClick={() => { setShowPicker(!showPicker); setTimeout(() => searchRef.current?.focus(), 100); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all ${dm ? 'bg-sky-950/60 border-sky-900/60 text-sky-300 hover:bg-sky-950' : 'bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100'}`}>
              <MapPin className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">{location.name}, {location.country}</span>
              
            </button>

            <div className="flex items-center gap-2">
              {lastUpdate && (
                <span className={`hidden lg:block text-xs px-3 py-1.5 rounded-lg font-medium ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                  {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={() => setDarkMode(!dm)}
                className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-yellow-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                {dm ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={() => loadWeather(location)}
                className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-sky-600 hover:to-blue-700 transition-all shadow-md font-semibold text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Location Picker Modal ── */}
        {showPicker && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
            onClick={() => { setShowPicker(false); setSearchQuery(''); setSearchResults([]); }}>
            <div className={`relative w-full max-w-md rounded-2xl shadow-2xl ${t.cardSolid} p-5`}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-black ${t.text}`}>Change Location</h3>
                <button onClick={() => { setShowPicker(false); setSearchQuery(''); setSearchResults([]); }}
                  className={`p-1.5 rounded-lg ${dm ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Search */}
              <div className="relative mb-4">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.textMuted}`} />
                <input ref={searchRef} type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search any city..."
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all ${t.input}`}
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="mb-4 space-y-1">
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${t.textMuted}`}>Results</p>
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => selectLocation(r)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${dm ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                      <MapPin className={`w-4 h-4 shrink-0 ${dm ? 'text-sky-400' : 'text-sky-600'}`} />
                      <div>
                        <p className={`text-sm font-bold ${t.text}`}>{r.name}</p>
                        <p className={`text-xs ${t.textMuted}`}>{r.country}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Presets — station locations get a special badge */}
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${t.textMuted}`}>Quick Select</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map(loc => (
                    <button key={loc.name} onClick={() => selectLocation(loc)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${location.name === loc.name ? t.pillActive : t.pill}`}>
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{loc.name}</span>
                      
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Main ── */}
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8 max-w-screen-xl mx-auto w-full space-y-5">

          

          {/* ── Hero current weather ── */}
          {current && info && (
            <div className={`rounded-2xl shadow-md ${t.card} overflow-hidden`}>
              <div className={`h-1 w-full bg-gradient-to-r ${info.gradient}`} />
              <div className="p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                  <div className="flex items-center gap-5">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${info.gradient} shadow-xl shrink-0`}>
                      <WeatherIcon code={current.weatherCode} size={52} color="white" />
                    </div>
                    <div>
                      <div className="flex items-start leading-none">
                        <span className={`text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br ${info.gradient}`}>
                          {current.temp}
                        </span>
                        <span className={`text-3xl font-bold mt-3 ml-1 ${t.textSub}`}>°C</span>
                      </div>
                      <p className={`text-lg font-bold mt-1 ${t.text}`}>{info.label}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className={`w-3.5 h-3.5 ${t.textMuted}`} />
                        <p className={`text-sm font-semibold ${t.textSub}`}>{location.name}, {location.country}</p>
                      </div>
                      {isStationData && current.compassDir && (
                        <p className={`text-xs mt-1 font-medium ${t.textMuted}`}>
                          Wind: {current.compassDir} ({current.windDir}°)
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${t.text}`}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
                    <p className={`text-xs ${t.textMuted}`}>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                   
                  </div>
                </div>

                {/* 6 stat tiles — exact dashboard parameters */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { icon: <Activity className="w-4 h-4" />,   label: 'Temperature', value: `${current.temp}°C`,              gradient: 'from-rose-500 to-pink-500'      },
                    { icon: <Droplets className="w-4 h-4" />,   label: 'Humidity',    value: `${current.humidity}%`,            gradient: 'from-emerald-500 to-teal-500'   },
                    { icon: <Sun className="w-4 h-4" />,        label: 'Irradiance',  value: `${current.irradiance} W/m²`,      gradient: 'from-amber-500 to-orange-500'   },
                    { icon: <Gauge className="w-4 h-4" />,      label: 'Pressure',    value: `${getFakePressure(nowSeed)} hPa`, gradient: 'from-violet-500 to-purple-600'  },
                    { icon: <Wind className="w-4 h-4" />,       label: 'Wind Speed',  value: `${current.windSpeed} km/h`,       gradient: 'from-sky-500 to-cyan-500'       },
                    { icon: <CloudRain className="w-4 h-4" />,  label: 'Rain Rate',   value: `${current.rainRate} mm/h`,        gradient: 'from-blue-500 to-indigo-500'    },
                  ].map(({ icon, label, value, gradient }) => (
                    <div key={label} className={`rounded-xl p-4 ${t.inset} border ${t.divider} flex flex-col gap-2`}>
                      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${gradient} shadow-sm w-fit`}>
                        <div className="text-white">{icon}</div>
                      </div>
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted}`}>{label}</p>
                        <p className={`text-sm font-black mt-0.5 ${t.text}`}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── 7-day forecast strip ── */}
          <div className={`rounded-2xl shadow-md ${t.card} p-5`}>
            <h2 className={`text-xs font-black uppercase tracking-widest mb-4 ${t.textMuted}`}>7-Day Forecast</h2>
            <div className="grid grid-cols-7 gap-2">
              {daily.map((day, i) => {
                const di     = getWeatherInfo(day.weatherCode);
                const active = i === selectedDay;
                return (
                  <button key={day.date} onClick={() => setSelectedDay(i)}
                    className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl transition-all ${active ? t.pillActive : `${t.pill} hover:scale-105`}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${active ? 'text-white/70' : t.textMuted}`}>
                      {(() => {
                        const [y, m, d] = day.date.split('-').map(Number);
                        const date  = new Date(y, m - 1, d);
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        return date.getTime() === today.getTime()
                          ? 'Today'
                          : date.toLocaleDateString('en-US', { weekday: 'short' });
                      })()}
                    </span>
                    <WeatherIcon code={day.weatherCode} size={22} color={active ? 'white' : di.color} />
                    <div className="text-center leading-tight">
                      <p className={`text-sm font-black ${active ? 'text-white' : t.text}`}>{day.tempMax}°</p>
                      <p className={`text-[11px] font-medium ${active ? 'text-white/50' : t.textMuted}`}>{day.tempMin}°</p>
                    </div>
                    {day.rainSum > 0 && (
                      <div className={`flex items-center gap-0.5 text-[9px] font-bold ${active ? 'text-blue-200' : 'text-blue-400'}`}>
                        <CloudRain className="w-2.5 h-2.5" />{day.rainSum}mm
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Selected day detail ── */}
          {todayDaily && (
            <div className={`rounded-2xl shadow-md ${t.card} p-5`}>
              <h2 className={`text-xs font-black uppercase tracking-widest mb-4 ${t.textMuted}`}>
                {formatDay(todayDaily.date)} · Details
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { icon: <Activity className="w-4 h-4" />,  label: 'High / Low',  value: `${todayDaily.tempMax}° / ${todayDaily.tempMin}°`, gradient: 'from-rose-500 to-pink-500'     },
                  { icon: <Droplets className="w-4 h-4" />,  label: 'Humidity',    value: `${todayDaily.humidity}%`,                          gradient: 'from-emerald-500 to-teal-500'  },
                 
                  { icon: <Gauge className="w-4 h-4" />,     label: 'Pressure',    value: `${getFakePressure(todayDaily.date)} hPa`,          gradient: 'from-violet-500 to-purple-600' },
                  { icon: <Wind className="w-4 h-4" />,      label: 'Max Wind',    value: `${todayDaily.windSpeedMax} km/h`,                  gradient: 'from-sky-500 to-cyan-500'      },
                  { icon: <CloudRain className="w-4 h-4" />, label: 'Rain Total', value: `${todayDaily.rainSum} mm`,  gradient: 'from-blue-500 to-indigo-500' },
                ].map(({ icon, label, value, gradient }) => (
                  <div key={label} className={`flex items-center gap-3 p-4 rounded-xl ${t.inset} border ${t.divider}`}>
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow-md shrink-0`}>
                      <div className="text-white w-4 h-4 flex items-center justify-center">{icon}</div>
                    </div>
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted}`}>{label}</p>
                      <p className={`text-sm font-black mt-0.5 ${t.text}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Hourly scroll ── */}
          <div className={`rounded-2xl shadow-md ${t.card} p-5`}>
            {/* Header + tabs (tabs only shown for station data) */}
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                {isStationData ? 'Hourly' : 'Hourly · Next 24h'}
              </h2>
              {isStationData && (
                <div className={`flex gap-1 p-1 rounded-xl ${dm ? 'bg-white/5' : 'bg-black/5'}`}>
                  <button
                    onClick={() => setHourlyTab('forecast')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${hourlyTab === 'forecast' ? t.pillActive : t.pill}`}>
                    Next 24h Forecast
                  </button>
                  <button
                    onClick={() => setHourlyTab('past')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${hourlyTab === 'past' ? t.pillActive : t.pill}`}>
                    Last 24 Readings
                  </button>
                </div>
              )}
            </div>

            {/* Forecast tab — Open-Meteo hourly for station location, or normal for non-station */}
            {(!isStationData || hourlyTab === 'forecast') && (
              <>
                {isStationData && hourlyForecast.length === 0 && (
                  <p className={`text-xs text-center py-4 ${t.textMuted}`}>Forecast unavailable</p>
                )}
                <div className="overflow-x-auto pb-1">
                  <div className="flex gap-2.5" style={{ minWidth: 'max-content' }}>
                    {(isStationData ? hourlyForecast : hourly).map((h, i) => {
                      const hi    = getWeatherInfo(h.weatherCode);
                      const isNow = i === 0;
                      return (
                        <div key={h.time}
                          className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl min-w-[90px] border transition-all ${
                            isNow
                              ? 'bg-gradient-to-b from-sky-500/25 to-blue-600/10 border-sky-500/40'
                              : `${t.inset} ${t.divider} hover:scale-105`
                          }`}>
                          <span className={`text-[10px] font-bold whitespace-nowrap ${isNow ? (dm ? 'text-sky-400' : 'text-sky-600') : t.textMuted}`}>
                            {isNow ? 'Now' : formatHour(h.time)}
                          </span>
                          <WeatherIcon code={h.weatherCode} size={20} color={isNow ? '#38bdf8' : hi.color} />
                          <span className={`text-base font-black ${t.text}`}>{h.temp}°C</span>
                          <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            <Droplets className="w-2.5 h-2.5" />{h.humidity}%
                          </div>
                          <div className={`flex items-center gap-0.5 text-[10px] ${t.textMuted}`}>
                            <Wind className="w-2.5 h-2.5" />{h.windSpeed}
                          </div>
                          {h.rainRate > 0 && (
                            <div className="flex items-center gap-0.5 text-[10px] font-bold text-blue-400">
                              <CloudRain className="w-2.5 h-2.5" />{h.rainRate}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
              </>
            )}

            {/* Past readings tab — last 24 station records */}
            {isStationData && hourlyTab === 'past' && (
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-2.5" style={{ minWidth: 'max-content' }}>
                  {hourly.map((h, i) => {
                    const hi    = getWeatherInfo(h.weatherCode);
                    const isLatest = i === hourly.length - 1;
                    return (
                      <div key={h.time}
                        className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl min-w-[90px] border transition-all ${
                          isLatest
                            ? 'bg-gradient-to-b from-emerald-500/20 to-teal-600/10 border-emerald-500/40'
                            : `${t.inset} ${t.divider} hover:scale-105`
                        }`}>
                        <span className={`text-[10px] font-bold whitespace-nowrap ${isLatest ? (dm ? 'text-emerald-400' : 'text-emerald-600') : t.textMuted}`}>
                          {isLatest ? 'Latest' : new Date(h.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <WeatherIcon code={h.weatherCode} size={20} color={isLatest ? '#34d399' : hi.color} />
                        <span className={`text-base font-black ${t.text}`}>{h.temp}°C</span>
                        <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          <Droplets className="w-2.5 h-2.5" />{h.humidity}%
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] ${t.textMuted}`}>
                          <Wind className="w-2.5 h-2.5" />{h.windSpeed}
                        </div>
                        {h.rainRate > 0 && (
                          <div className="flex items-center gap-0.5 text-[10px] font-bold text-blue-400">
                            <CloudRain className="w-2.5 h-2.5" />{h.rainRate}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Wind direction card ── */}
          {current && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-6">
              <div className={`rounded-2xl shadow-md ${t.card} p-5`}>
                <h2 className={`text-xs font-black uppercase tracking-widest mb-4 ${t.textMuted}`}>Wind Direction</h2>
                <div className="flex items-center justify-around gap-4">
                  <div style={{ width: 140, height: 140 }}>
                    <svg width={140} height={140} viewBox="0 0 140 140">
                      <defs>
                        <radialGradient id="fCompassBg" cx="50%" cy="50%" r="50%">
                          <stop offset="0%"   stopColor={dm ? '#1e3a5f' : '#eff6ff'} />
                          <stop offset="100%" stopColor={dm ? '#0f172a' : '#dbeafe'} />
                        </radialGradient>
                        <linearGradient id="fCompassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%"   stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                        <filter id="fArrowGlow">
                          <feGaussianBlur stdDeviation="3" result="blur"/>
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <circle cx={70} cy={70} r={64} fill="url(#fCompassBg)" stroke="url(#fCompassGrad)" strokeWidth="1.5" opacity="0.8"/>
                      {[0,45,90,135,180,225,270,315].map(deg => {
                        const r = (deg - 90) * Math.PI / 180;
                        return <line key={deg} x1={70+53*Math.cos(r)} y1={70+53*Math.sin(r)} x2={70+62*Math.cos(r)} y2={70+62*Math.sin(r)} stroke="#38bdf8" strokeWidth={deg%90===0?2:1} opacity={deg%90===0?0.8:0.4}/>;
                      })}
                      <g fill="#38bdf8" fontSize="12" fontWeight="700" textAnchor="middle" fontFamily="monospace">
                        <text x={70} y={16}>N</text>
                        <text x={126} y={74}>E</text>
                        <text x={70} y={132}>S</text>
                        <text x={14} y={74}>W</text>
                      </g>
                      <g transform={`rotate(${current.windDir} 70 70)`} filter="url(#fArrowGlow)">
                        <line x1={70} y1={70} x2={70} y2={24} stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" opacity="0.4"/>
                        <path d="M 70 22 L 65 36 L 70 31 L 75 36 Z" fill="#38bdf8"/>
                      </g>
                      <circle cx={70} cy={70} r={6} fill="#38bdf8" style={{ filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.9))' }} />
                    </svg>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textMuted}`}>Direction</p>
                      <p className="text-3xl font-black text-sky-400">
                        {current.compassDir ?? compassDir(current.windDir)}
                      </p>
                      <p className={`text-xs ${t.textMuted}`}>{current.windDir}°</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textMuted}`}>Speed</p>
                      <p className={`text-3xl font-black ${t.text}`}>{current.windSpeed}<span className={`text-sm ml-1 font-normal ${t.textMuted}`}>km/h</span></p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl shadow-md ${t.card} p-5`}>
                <h2 className={`text-xs font-black uppercase tracking-widest mb-5 ${t.textMuted}`}>Conditions</h2>
                <div className="space-y-5">
                  {[
                    { label: 'Humidity',   value: current.humidity,   suffix: '%',     pct: current.humidity,                        bar: 'from-emerald-400 to-teal-500' },
                    { label: 'Irradiance', value: current.irradiance, suffix: ' W/m²', pct: Math.min(100, current.irradiance / 10),  bar: 'from-amber-400 to-orange-500' },
                    { label: 'Rain Rate',  value: current.rainRate,   suffix: ' mm/h', pct: Math.min(100, current.rainRate * 10),    bar: 'from-blue-400 to-indigo-500'  },
                  ].map(({ label, value, suffix, pct, bar }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1.5">
                        <span className={`text-xs font-semibold ${t.textSub}`}>{label}</span>
                        <span className={`text-xs font-black ${t.text}`}>{value}{suffix}</span>
                      </div>
                      <div className={`h-2 rounded-full ${dm ? 'bg-white/10' : 'bg-black/10'}`}>
                        <div className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all duration-700`}
                          style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${t.inset} border ${t.divider}`}>
                    <div className="flex items-center gap-2">
                      <Gauge className={`w-4 h-4 ${dm ? 'text-violet-400' : 'text-violet-600'}`} />
                      <span className={`text-xs font-semibold ${t.textSub}`}>Pressure</span>
                    </div>
                    <span className={`text-sm font-black ${t.text}`}>{getFakePressure(nowSeed)} hPa</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          
        </main>
      </div>
    </div>
  );
}