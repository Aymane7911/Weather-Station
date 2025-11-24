'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, Edit2, Check, X, Loader2, MapPin, Activity, RefreshCw, Plus, Search, AlertCircle, LogOut, User, Menu, Wind, Home, Clock, Download, Settings } from 'lucide-react';
import Head from 'next/head';


interface WeatherStation {
  id: string;
  name: string;
  containerName: string;
  color: string;
  lastActive?: Date;
  status: 'active' | 'inactive' | 'warning';
  blobCount?: number;
}



const WeatherStationSelector = () => {
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userName, setUserName] = useState<string>('User');
  const [userAccess, setUserAccess] = useState<{
    hasAccess: boolean;
    isAdmin: boolean;
    containers: string[];
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState<boolean>(true);

  const colorGradients = [
    'from-blue-500 to-cyan-500',
    'from-orange-500 to-red-500',
    'from-teal-500 to-emerald-500',
    'from-purple-500 to-indigo-500',
    'from-pink-500 to-rose-500',
    'from-green-500 to-lime-500',
    'from-violet-500 to-purple-500',
    'from-amber-500 to-yellow-500'
  ];

  useEffect(() => {
    fetchContainers();
    fetchUserInfo();
    fetchUserAccess();
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      setAdminCheckLoading(true);
      const token = localStorage.getItem('authToken');
      
      const response = await fetch('/api/auth/check-admin', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      setIsAdmin(data.isAdmin || false);
    } catch (error) {
      console.error('Failed to check admin status:', error);
      setIsAdmin(false);
    } finally {
      setAdminCheckLoading(false);
    }
  };

  const fetchUserAccess = async () => {
    try {
      const response = await fetch('/api/user/accessible-containers');
      if (response.ok) {
        const data = await response.json();
        setUserAccess(data);
      }
    } catch (err) {
      console.error('Error fetching user access:', err);
    }
  };


  useEffect(() => {
  document.title = 'Weather Selection';
}, []);
  const fetchUserInfo = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUserName(data.user.name || data.user.email);
      }
    } catch (err) {
      console.error('Error fetching user info:', err);
    }
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        window.location.href = '/auth/login';
      } else {
        throw new Error('Logout failed');
      }
    } catch (err) {
      console.error('Logout error:', err);
      alert('Failed to logout. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const fetchContainers = async () => {
    try {
      setLoading(true);
      setError(null);

      const accessResponse = await fetch('/api/user/accessible-containers');
      if (!accessResponse.ok) {
        throw new Error('Failed to fetch user access');
      }
      
      const accessData = await accessResponse.json();
      setUserAccess(accessData);

      if (!accessData.hasAccess && !accessData.isAdmin) {
        setError('You do not have access to any weather stations. Please contact an administrator.');
        setStations([]);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/containers/list');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch containers: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.containers || data.containers.length === 0) {
        setError('No weather stations found');
        setStations([]);
        return;
      }

      let allowedContainers = data.containers;
      
      if (!accessData.isAdmin) {
        allowedContainers = data.containers.filter((container: any) => 
          accessData.containers.includes(container.name)
        );
        
        if (allowedContainers.length === 0) {
          setError('You do not have access to any weather stations.');
          setStations([]);
          setLoading(false);
          return;
        }
      }

      const weatherStations: WeatherStation[] = await Promise.all(
        allowedContainers.map(async (container: any, index: number) => {
          try {
            const blobResponse = await fetch(`/api/weather-data?container=${container.name}`, {
              method: 'GET'
            });

            let lastActive = undefined;
            let blobCount = 0;
            let status: 'active' | 'inactive' | 'warning' = 'inactive';

            if (blobResponse.ok) {
              const blobData = await blobResponse.json();
              blobCount = blobData.blobCount || 0;
              
              if (blobData.blobs && blobData.blobs.length > 0) {
                const mostRecent = blobData.blobs[0];
                lastActive = mostRecent.lastModified ? new Date(mostRecent.lastModified) : undefined;
                
                if (lastActive) {
                  const hoursSinceUpdate = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
                  if (hoursSinceUpdate < 1) {
                    status = 'active';
                  } else if (hoursSinceUpdate < 24) {
                    status = 'warning';
                  } else {
                    status = 'inactive';
                  }
                }
              }
            }

            const storedName = localStorage.getItem(`station_name_${container.name}`);
            const displayName = storedName || container.name.replace('ws-', '').replace(/-/g, ' ')
              .split(' ')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ') + ' Station';

            return {
              id: container.name,
              name: displayName,
              containerName: container.name,
              color: colorGradients[index % colorGradients.length],
              lastActive,
              status,
              blobCount
            };
          } catch (err) {
            console.error(`Error fetching data for container ${container.name}:`, err);
            return {
              id: container.name,
              name: container.name,
              containerName: container.name,
              color: colorGradients[index % colorGradients.length],
              status: 'inactive' as const,
              blobCount: 0
            };
          }
        })
      );

      setStations(weatherStations);
    } catch (err) {
      console.error('Error fetching containers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch weather stations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchContainers();
  };

  const handleEditStart = (station: WeatherStation) => {
    setEditingId(station.id);
    setEditName(station.name);
  };

  const handleEditSave = (id: string) => {
    const updatedStations = stations.map(s => 
      s.id === id ? { ...s, name: editName } : s
    );
    setStations(updatedStations);
    localStorage.setItem(`station_name_${id}`, editName);
    setEditingId(null);
    setEditName('');
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleStationClick = (station: WeatherStation) => {
    if (editingId) return;
    localStorage.setItem('selected_station', station.containerName);
    localStorage.setItem('selected_station_name', station.name);
    window.location.href = `/dashboard?container=${station.containerName}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'inactive': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'warning': return 'Limited Data';
      case 'inactive': return 'Offline';
      default: return 'Unknown';
    }
  };

  const filteredStations = stations.filter(station =>
    station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    station.containerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            
          

            <div className="my-4 border-t border-blue-500/30"></div>
            
            

            {!adminCheckLoading && isAdmin && (
              <>
                <div className="my-4 border-t border-blue-500/30"></div>
                
                <button 
                  onClick={() => {
                    window.location.href = '/access';
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-yellow-400/20 to-amber-400/20 text-yellow-100 hover:from-yellow-400/30 hover:to-amber-400/30 transition-all font-medium text-sm border border-yellow-400/30 shadow-md"
                >
                  <Settings className="w-5 h-5" />
                  <span>Admin Panel</span>
                </button>
              </>
            )}
          </nav>

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
            <Cloud className="w-12 h-12 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-2xl font-bold text-gray-700 mb-2">Loading Weather Stations</p>
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
          <h2 className="text-3xl font-black text-gray-800 mb-3 text-center">Error Loading Stations</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button 
            onClick={fetchContainers}
            className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white py-4 px-6 rounded-xl hover:from-red-600 hover:to-orange-700 transition-all duration-300 flex items-center justify-center font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <RefreshCw className="w-5 h-5 mr-3" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <Head>
      <title>Weather Stations - Select Station</title>
    </Head>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Sidebar />
      
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                Weather Stations
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Select a station to view real-time data</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search weather stations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </div>
      </header>

      {showUserMenu && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={() => setShowUserMenu(false)}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {filteredStations.length === 0 ? (
          <div className="text-center py-20">
            <Cloud className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-600 mb-2">No stations found</h3>
            <p className="text-gray-500">Try adjusting your search or add a new station</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredStations.map((station) => (
              <div
                key={station.id}
                className="relative group"
                onMouseEnter={() => setHoveredId(station.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  onClick={() => handleStationClick(station)}
                  className={`relative bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 ${
                    editingId === station.id ? 'ring-4 ring-blue-500' : ''
                  } cursor-pointer`}
                >
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      station.status === 'active' ? 'bg-green-500 animate-pulse' :
                      station.status === 'warning' ? 'bg-yellow-500' :
                      'bg-gray-300'
                    }`} />
                  </div>

                  <div className={`w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br ${station.color} flex items-center justify-center shadow-xl transform transition-transform duration-500 ${
                    hoveredId === station.id ? 'scale-110 rotate-6' : 'scale-100'
                  }`}>
                    <Cloud className="w-16 h-16 text-white" />
                  </div>

                  {editingId === station.id ? (
                    <div className="mb-4">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-3 py-2 text-center text-lg font-bold text-gray-800 bg-gray-50 border-2 border-blue-500 rounded-lg focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2 mt-3 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSave(station.id);
                          }}
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditCancel();
                          }}
                          className="p-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 relative group/name">
                      <h3 className="text-lg font-bold text-gray-800 text-center mb-1 pr-8">
                        {station.name}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(station);
                        }}
                        className="absolute right-0 top-0 p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover/name:opacity-100 transition-opacity"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Status:</span>
                      <span className={`font-semibold ${getStatusColor(station.status)}`}>
                        {getStatusText(station.status)}
                      </span>
                    </div>
                    
                    {station.lastActive && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Last Update:</span>
                        <span className="font-semibold text-gray-800">
                          {new Date(station.lastActive).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className={`text-center font-semibold text-sm bg-gradient-to-r ${station.color} bg-clip-text text-transparent`}>
                      Click to view dashboard →
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
     </>
  );
};

export default WeatherStationSelector;