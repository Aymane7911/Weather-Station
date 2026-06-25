'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, Edit2, Check, X, Loader2, RefreshCw, Search, AlertCircle, LogOut, Menu, Home, Settings, SunMedium, Moon } from 'lucide-react';
import Head from 'next/head';

interface WeatherStation {
  id: string;
  name: string;
  containerName: string;
  color: string;
  lastActive?: Date;
  status: 'active' | 'inactive' | 'warning';
  blobCount?: number;
  lat?: number;
  lng?: number;
  connectionIndex: 0 | 1 | 2;
}

const colorGradients = [
  'from-sky-500 to-cyan-500',
  'from-orange-500 to-rose-500',
  'from-teal-500 to-emerald-500',
  'from-violet-500 to-purple-500',
  'from-pink-500 to-rose-500',
  'from-green-500 to-teal-500',
  'from-blue-500 to-indigo-500',
  'from-amber-500 to-orange-500',
];

const colorAccents = [
  '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6',
  '#ec4899', '#22c55e', '#3b82f6', '#f59e0b',
];

const colorHex: Record<string, string> = {
  'from-sky-500 to-cyan-500': '#0ea5e9',
  'from-orange-500 to-rose-500': '#f97316',
  'from-teal-500 to-emerald-500': '#14b8a6',
  'from-violet-500 to-purple-500': '#8b5cf6',
  'from-pink-500 to-rose-500': '#ec4899',
  'from-green-500 to-teal-500': '#22c55e',
  'from-blue-500 to-indigo-500': '#3b82f6',
  'from-amber-500 to-orange-500': '#f59e0b',
};

const WeatherStationSelector = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userName, setUserName] = useState('User');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(true);
  const [leafletReady, setLeafletReady] = useState(false);
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);

  const dm = mounted && darkMode;

  const t = {
    bg: 'bg-transparent',
    card: dm
      ? 'bg-gray-900/40 border border-white/10 backdrop-blur-md'
      : 'bg-white/40 border border-white/50 backdrop-blur-md',
    text: dm ? 'text-gray-100' : 'text-gray-900',
    textSub: dm ? 'text-gray-300' : 'text-gray-700',
    textMuted: dm ? 'text-gray-400' : 'text-gray-500',
    divider: dm ? 'border-white/10' : 'border-black/10',
    input: dm
      ? 'bg-gray-800/60 border-white/10 text-gray-100 placeholder-gray-400 focus:ring-sky-500'
      : 'bg-white/60 border-white/40 text-gray-900 placeholder-gray-400 focus:ring-sky-500',
  };

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchContainers();
    fetchUserInfo();
    checkAdminStatus();
    document.title = 'Weather Stations';
  }, []);

  useEffect(() => {
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true') setDarkMode(true);
  setMounted(true);
}, []);

useEffect(() => {
  if (!mounted) return;
  localStorage.setItem('darkMode', String(darkMode));
}, [darkMode, mounted]);
  // Load Leaflet
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => setLeafletReady(true);
      document.head.appendChild(script);
    } else if ((window as any).L) {
      setLeafletReady(true);
    }
  }, []);

  // Init / rebuild map when stations or darkMode changes
  useEffect(() => {
    if (!leafletReady || !mapRef.current || stations.length === 0) return;
    const L = (window as any).L;
    if (!L) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    const stationsWithCoords = stations.filter(s => s.lat && s.lng);
    if (stationsWithCoords.length === 0) return;

    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Apply dark mode filter to tile layer
    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = darkMode
        ? 'invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.8)'
        : 'none';
    }

    const bounds: [number, number][] = [];
    stationsWithCoords.forEach(station => {
      const color = colorHex[station.color] || '#0ea5e9';
      const sc = station.status === 'active' ? '#10b981' : station.status === 'warning' ? '#f59e0b' : '#6b7280';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:44px;height:44px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;">
          <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'/></svg>
          <div style="position:absolute;bottom:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:${sc};border:2px solid white;"></div>
        </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([station.lat!, station.lng!], { icon }).addTo(map);
      bounds.push([station.lat!, station.lng!]);
      marker.bindPopup(`
        <div style="font-family:sans-serif;min-width:160px;padding:4px">
          <div style="font-weight:800;font-size:14px;margin-bottom:4px">${station.name}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:8px">${station.containerName}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:${sc}"></div>
            <span style="font-size:11px;font-weight:600;color:${sc}">${station.status === 'active' ? 'Live' : station.status === 'warning' ? 'Limited Data' : 'Offline'}</span>
          </div>
          <a href="/dashboard?container=${station.containerName}" style="display:block;text-align:center;background:${color};color:white;padding:6px 12px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none">Open Dashboard →</a>
        </div>`, { maxWidth: 220 });
    });
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
  }, [leafletReady, stations, darkMode]);

  // Update tile filter when darkMode toggles WITHOUT rebuilding the map
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const tilePane = mapInstanceRef.current.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = darkMode
        ? 'invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.8)'
        : 'none';
    }
  }, [darkMode]);

  // ── API calls ─────────────────────────────────────────────────────────────────
  const checkAdminStatus = async () => {
    try {
      setAdminCheckLoading(true);
      const res = await fetch('/api/auth/check-admin', { credentials: 'include' });
      const data = await res.json();
      setIsAdmin(data.isAdmin || false);
    } catch { setIsAdmin(false); }
    finally { setAdminCheckLoading(false); }
  };

  const fetchUserInfo = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) { const d = await res.json(); setUserName(d.user.name || d.user.email); }
    } catch {}
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) window.location.href = '/auth/login';
      else throw new Error('Logout failed');
    } catch { alert('Failed to logout. Please try again.'); }
    finally { setLoggingOut(false); }
  };

  const fetchContainers = async () => {
    try {
      setLoading(true);
      setError(null);

      const accessRes = await fetch('/api/user/accessible-containers');
      if (!accessRes.ok) throw new Error('Failed to fetch user access');
      const accessData = await accessRes.json();

      if (!accessData.hasAccess && !accessData.isAdmin) {
        setError('You do not have access to any weather stations.');
        setStations([]);
        setLoading(false);
        return;
      }

      const containersRes = await fetch('/api/containers/list');
      if (!containersRes.ok) throw new Error('Failed to fetch containers');
      const containersData = await containersRes.json();

      if (!containersData.containers || containersData.containers.length === 0) {
        setError('No weather stations found');
        setStations([]);
        return;
      }

      let allowed = containersData.containers;
      if (!accessData.isAdmin) {
        allowed = containersData.containers.filter((c: any) => accessData.containers.includes(c.name));
        if (allowed.length === 0) {
          setError('You do not have access to any weather stations.');
          setStations([]);
          setLoading(false);
          return;
        }
      }

      // Fetch saved locations from DB
      let stationLocations: Record<string, { lat?: number; lng?: number }> = {};
      try {
        const locRes = await fetch('/api/stations');
        if (locRes.ok) {
          const locData = await locRes.json();
          (locData.stations || []).forEach((s: any) => {
            stationLocations[s.containerName] = {
              lat: s.lat ?? undefined,
              lng: s.lng ?? undefined,
            };
          });
        }
      } catch {}

      // Step 1: Render cards instantly
const weatherStations: WeatherStation[] = allowed
  .filter((container: any) => container.name !== 'ws-fpo') // ← hide fpo
  .map((container: any, index: number) => {
        const storedName = localStorage.getItem(`station_name_${container.name}`);
        const displayName = storedName || container.name
          .replace('ws-', '').replace(/-/g, ' ')
          .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Station';
        const loc = stationLocations[container.name] || {};
        return {
          id: container.name,
          name: displayName,
          containerName: container.name,
          color: colorGradients[index % colorGradients.length],
          status: 'inactive' as const,
          blobCount: 0,
          lat: loc.lat,
          lng: loc.lng,
          connectionIndex: (container.connectionIndex ?? 0) as 0 | 1 | 2,
        };
      });
      setStations(weatherStations);

      // Step 2: Fetch status in background
      allowed
  .filter((container: any) => container.name !== 'ws-fpo')
  .forEach(async (container: any) => {
        try {
          const res = await fetch('/api/weather-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ containerName: container.name,connectionIndex: container.connectionIndex ?? 0,  latestOnly: true }),
          });
          if (!res.ok) return;
          const d = await res.json();
          const blobCount = d.pagination?.totalFiles || 0;
          const latest = d.data?.[0];
          if (!latest?.time) return;
          const lastActive = new Date(latest.time);
          const hours = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
          const status: 'active' | 'inactive' | 'warning' = hours < 1 ? 'active' : hours < 24 ? 'warning' : 'inactive';
          setStations(prev => prev.map(s => s.id === container.name ? { ...s, lastActive, status, blobCount } : s));
        } catch {}
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather stations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRefresh = () => { setRefreshing(true); fetchContainers(); };
  const handleEditStart = (station: WeatherStation) => { setEditingId(station.id); setEditName(station.name); };
  const handleEditSave = (id: string) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, name: editName } : s));
    localStorage.setItem(`station_name_${id}`, editName);
    setEditingId(null);
    setEditName('');
  };
  const handleEditCancel = () => { setEditingId(null); setEditName(''); };
  const handleStationClick = (station: WeatherStation) => {
    if (editingId) return;
    localStorage.setItem('selected_station', station.containerName);
    localStorage.setItem('selected_station_name', station.name);
    localStorage.setItem('selected_connection_index',   String(station.connectionIndex));
    window.location.href = `/dashboard?container=${station.containerName}`;
  };

  const getStatusConfig = (status: string) => ({
    active:   { dot: 'bg-emerald-400', pulse: true,  label: 'Live' },
    warning:  { dot: 'bg-amber-400',   pulse: false, label: 'Limited Data' },
    inactive: { dot: 'bg-gray-400',    pulse: false, label: 'Offline' },
  }[status] || { dot: 'bg-gray-400', pulse: false, label: 'Unknown' });

  const filteredStations = stations.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.containerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100'} flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${dm ? 'bg-sky-700' : 'bg-sky-300'} animate-pulse`} />
          <div className={`absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-15 ${dm ? 'bg-blue-700' : 'bg-blue-300'} animate-pulse`} style={{ animationDelay: '1s' }} />
        </div>
        <div className="relative text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className={`absolute inset-0 border-2 rounded-full ${dm ? 'border-gray-800' : 'border-gray-200'}`} />
            <div className="absolute inset-0 border-2 border-sky-500 rounded-full border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Cloud className={`w-10 h-10 ${dm ? 'text-sky-400' : 'text-sky-500'}`} />
            </div>
          </div>
          <p className={`text-xl font-bold mb-1 ${dm ? 'text-gray-100' : 'text-gray-800'}`}>Loading Stations</p>
          <p className={`text-sm ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Fetching your weather stations...</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100'} flex items-center justify-center p-6`}>
        <div className={`rounded-3xl shadow-2xl p-10 max-w-md w-full ${dm ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-black mb-3 text-center ${dm ? 'text-gray-100' : 'text-gray-900'}`}>Access Error</h2>
          <p className={`text-center mb-6 text-sm ${dm ? 'text-gray-400' : 'text-gray-600'}`}>{error}</p>
          <button onClick={fetchContainers} className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-3.5 px-6 rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all font-bold text-sm shadow-lg flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Head><title>Weather Stations — Select Station</title></Head>

      <div className="min-h-screen relative transition-colors duration-300">

        {/* Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <img src="/cloud4.jpg" className="absolute inset-0 w-full h-full object-cover" alt="" />
          <div className={`absolute inset-0 ${dm ? 'bg-black/55' : 'bg-white/40'}`} />
        </div>

        {/* Sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        
<aside className={`fixed top-0 left-0 h-full w-72 z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${dm ? 'bg-gray-950 border-r border-gray-800' : 'bg-white border-r border-gray-100'} shadow-2xl flex flex-col`}>

  {/* Sidebar header */}
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

  {/* User chip */}
  <div className={`mx-4 my-4 px-4 py-3 rounded-xl ${dm ? 'bg-sky-950/60 border border-sky-900/60' : 'bg-sky-50 border border-sky-100'}`}>
    <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${dm ? 'text-sky-400' : 'text-sky-600'}`}>Signed in as</p>
    <p className={`text-sm font-bold truncate ${t.text}`}>{userName}</p>
  </div>

  {/* Nav */}
  <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
    <p className={`text-xs font-semibold uppercase tracking-widest px-2 py-2 ${t.textMuted}`}>Navigation</p>
    {[
      { id: 'dashboard', label: 'Stations',  icon: Home,  action: () => { setActiveTab('dashboard'); setSidebarOpen(false); } },
      { id: 'forecast',  label: 'Forecast',  icon: Cloud, action: () => { window.location.href = '/forecast'; setSidebarOpen(false); } },
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

  {/* Dark mode + logout */}
  <div className={`px-4 py-4 border-t ${t.divider} space-y-2`}>
    <button onClick={() => setDarkMode(!dm)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${dm ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
      {dm ? <SunMedium className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
      {dm ? 'Light Mode' : 'Dark Mode'}
    </button>
    <button onClick={handleLogout} disabled={loggingOut} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${dm ? 'bg-red-950/50 text-red-400 border border-red-900/40 hover:bg-red-950' : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'}`}>
      {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
      Sign Out
    </button>
  </div>

</aside>

        {/* Page wrapper */}
        <div className="relative z-10 flex flex-col min-h-screen">

          {/* Header */}
          <header className={`sticky top-0 z-30 ${dm ? 'bg-gray-900/30 border-b border-white/10' : 'bg-white/20 border-b border-white/30'} backdrop-blur-xl transition-colors duration-300`}>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                  <Menu className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-2.5">
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
              </div>

              <div className="hidden md:flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dm ? 'text-emerald-400 bg-emerald-950/60 border-emerald-900/60' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
                  {stations.filter(s => s.status === 'active').length} Live
                </span>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${dm ? 'text-sky-400 bg-sky-950/60 border-sky-900/60' : 'text-sky-700 bg-sky-50 border-sky-100'}`}>
                  {stations.length} Stations
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setDarkMode(!dm)} className={`p-2 rounded-lg transition-colors ${dm ? 'hover:bg-gray-800 text-yellow-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                  {dm ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-sky-600 hover:to-blue-700 transition-all shadow-md font-bold text-xs disabled:opacity-60">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
          </header>

          {/* Search */}
          <div className="flex justify-center px-5 py-4">
            <div className="relative w-full max-w-md">
              <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${t.textMuted}`} />
              <input
                type="text"
                placeholder="Search stations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all text-sm backdrop-blur-md ${t.input}`}
              />
            </div>
          </div>

          {/* Main */}
          <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center mb-10">
              <h2 className={`text-3xl font-black tracking-tight mb-2 ${t.text}`}>Select a Station</h2>
              <p className={`text-sm ${t.textSub}`}>Choose a weather station below to view its real-time dashboard</p>
            </div>

            {filteredStations.length === 0 ? (
              <div className="text-center py-20">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <Cloud className={`w-10 h-10 ${t.textMuted}`} />
                </div>
                <h3 className={`text-lg font-bold mb-1 ${t.text}`}>No stations found</h3>
                <p className={`text-sm ${t.textSub}`}>Try adjusting your search query</p>
              </div>
            ) : (
              <div className="w-full max-w-5xl mx-auto flex flex-wrap gap-6 justify-center items-stretch">
                {filteredStations.map((station, index) => {
                  const statusCfg = getStatusConfig(station.status);
                  const accentColor = colorAccents[index % colorAccents.length];
                  const isHovered = hoveredId === station.id;
                  const isEditing = editingId === station.id;

                  return (
                    <div
                      key={station.id}
                      className="relative w-[220px] flex-shrink-0 flex flex-col"
                      onMouseEnter={() => setHoveredId(station.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {/* Glow */}
                      <div
                        className="absolute inset-0 rounded-2xl blur-xl pointer-events-none -z-10"
                        style={{ background: `radial-gradient(circle, ${accentColor}30, transparent 70%)`, opacity: isHovered ? 0.5 : 0, transform: 'scale(1.1)', transition: 'opacity 0.3s' }}
                      />

                      {/* Card */}
                      <div
                        onClick={() => handleStationClick(station)}
                        className={`relative rounded-2xl shadow-md transition-all duration-300 cursor-pointer overflow-hidden flex flex-col flex-1 ${t.card} ${isEditing ? 'ring-2 ring-sky-500' : ''} ${isHovered ? 'shadow-xl -translate-y-1.5' : ''}`}
                        style={isHovered ? { boxShadow: `0 20px 60px ${accentColor}25, 0 8px 24px rgba(0,0,0,0.12)` } : {}}
                      >
                        {/* Top bar */}
                        <div className={`h-1 w-full bg-gradient-to-r ${station.color}`} />

                        <div className="p-6 flex flex-col flex-1">

                          {/* Status badge */}
                          <div className="flex items-center justify-between mb-5">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                              station.status === 'active'
                                ? dm ? 'bg-emerald-950/60 border border-emerald-900/60 text-emerald-400' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                                : station.status === 'warning'
                                ? dm ? 'bg-amber-950/60 border border-amber-900/60 text-amber-400' : 'bg-amber-50 border border-amber-100 text-amber-700'
                                : dm ? 'bg-gray-800 border border-gray-700 text-gray-500' : 'bg-gray-100 border border-gray-200 text-gray-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${statusCfg.pulse ? 'animate-pulse' : ''}`} />
                              {statusCfg.label}
                            </div>
                          </div>

                          {/* Icon */}
                          <div
                            className={`w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br ${station.color} flex items-center justify-center shadow-lg transition-all duration-300 ${isHovered ? 'scale-110 rotate-3' : 'scale-100'}`}
                            style={isHovered ? { boxShadow: `0 12px 32px ${accentColor}50` } : {}}
                          >
                            <Cloud className="w-10 h-10 text-white" />
                          </div>

                          {/* Name */}
                          {isEditing ? (
                            <div className="mb-4">
                              <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                autoFocus
                                className={`w-full px-3 py-2 text-center text-sm font-bold rounded-lg border-2 border-sky-500 focus:outline-none ${dm ? 'bg-gray-800 text-gray-100' : 'bg-gray-50 text-gray-900'}`}
                              />
                              <div className="flex gap-2 mt-3 justify-center">
                                <button onClick={e => { e.stopPropagation(); handleEditSave(station.id); }} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); handleEditCancel(); }} className={`p-2 rounded-lg transition-colors ${dm ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-4 relative group/name flex flex-col items-center">
                              <h3 className={`text-sm font-black text-center leading-tight ${t.text}`}>{station.name}</h3>
                              <button
                                onClick={e => { e.stopPropagation(); handleEditStart(station); }}
                                className={`absolute right-0 top-0 p-1 rounded-lg opacity-0 group-hover/name:opacity-100 transition-opacity ${dm ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* Last update */}
                          <div className={`text-xs border-t border-b py-4 my-2 ${t.divider}`}>
                            {station.lastActive ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className={`${t.textMuted} whitespace-nowrap`}>Last update:</span>
                                <span className={`font-semibold whitespace-nowrap ${t.textSub}`}>
                                  {new Date(station.lastActive).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </div>
                            ) : (
                              <div className="text-center">
                                <span className={`${t.textMuted} italic`}>No data available</span>
                              </div>
                            )}
                          </div>

                          {/* CTA */}
                          <div className="mt-auto pt-3">
                            <div className={`text-center text-xs font-bold bg-gradient-to-r ${station.color} bg-clip-text text-transparent transition-all duration-200 ${isHovered ? 'opacity-100' : 'opacity-60'}`}>
                              Open Dashboard →
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          {/* Map Section */}
          <section className="px-4 sm:px-6 lg:px-8 pb-12 max-w-5xl mx-auto w-full">
            <div className="text-center mb-6">
              <h2 className={`text-2xl font-black tracking-tight mb-1 ${t.text}`}>Station Locations</h2>
              <p className={`text-sm ${t.textSub}`}>Click a marker to open the station dashboard</p>
            </div>

            {stations.some(s => s.lat && s.lng) ? (
              <div className={`rounded-2xl overflow-hidden shadow-lg ${t.card}`}>
                <div ref={mapRef} style={{ height: '400px', width: '100%' }} />
              </div>
            ) : (
              <div className={`rounded-2xl p-10 text-center ${t.card}`}>
                <div className="text-4xl mb-3">📍</div>
                <h3 className={`text-base font-bold mb-1 ${t.text}`}>No locations set</h3>
                <p className={`text-sm ${t.textSub}`}>Set station coordinates in the Admin Panel to display them on the map</p>
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  );
};

export default WeatherStationSelector;
