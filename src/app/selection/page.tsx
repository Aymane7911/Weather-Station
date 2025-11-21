'use client'

import React, { useState, useEffect } from 'react';
import { Cloud, Edit2, Check, X, Loader2, MapPin, Activity, RefreshCw, Plus, Search, AlertCircle, LogOut, User } from 'lucide-react';

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

// Add this useEffect:
useEffect(() => {
  fetchUserAccess();
}, []);

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
        // Redirect to login page
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

    // First, fetch user access to check permissions
    const accessResponse = await fetch('/api/user/accessible-containers');
    if (!accessResponse.ok) {
      throw new Error('Failed to fetch user access');
    }
    
    const accessData = await accessResponse.json();
    setUserAccess(accessData);

    // If user doesn't have access, show error and return
    if (!accessData.hasAccess && !accessData.isAdmin) {
      setError('You do not have access to any weather stations. Please contact an administrator.');
      setStations([]);
      setLoading(false);
      return;
    }

    // Fetch list of containers from Azure
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

    // Filter containers based on user access
    let allowedContainers = data.containers;
    
    if (!accessData.isAdmin) {
      // If not admin, only show containers in their access list
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

    // Map containers to weather stations
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
    
    // Save to localStorage
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
    
    // Store selected station for the dashboard to use
    localStorage.setItem('selected_station', station.containerName);
    localStorage.setItem('selected_station_name', station.name);
    
    // Redirect to dashboard with container parameter
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
          <p className="text-gray-500">Fetching from Azure Storage...</p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                Weather Stations
              </h1>
              <p className="text-sm text-gray-500 mt-1">Select a station to view real-time data</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl transition-all duration-300 font-semibold text-sm"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{userName}</span>
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-700">{userName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Signed in</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loggingOut ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogOut className="w-4 h-4" />
                      )}
                      <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-6 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-black-400" />
            <input
              type="text"
              placeholder="Search weather stations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </header>

      {/* Click outside to close menu */}
      {showUserMenu && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={() => setShowUserMenu(false)}
        />
      )}

      {/* Main Content */}
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
                {/* Station Circle */}
                <div
                  onClick={() => handleStationClick(station)}
                  className={`relative bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 ${
                    editingId === station.id ? 'ring-4 ring-blue-500' : ''
                  } cursor-pointer`}
                >
                  {/* Status Indicator */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      station.status === 'active' ? 'bg-green-500 animate-pulse' :
                      station.status === 'warning' ? 'bg-yellow-500' :
                      'bg-gray-300'
                    }`} />
                  </div>

                  {/* Station Icon */}
                  <div className={`w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br ${station.color} flex items-center justify-center shadow-xl transform transition-transform duration-500 ${
                    hoveredId === station.id ? 'scale-110 rotate-6' : 'scale-100'
                  }`}>
                    <Cloud className="w-16 h-16 text-white" />
                  </div>

                  {/* Station Name */}
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

                  

                  {/* Stats */}
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

                  {/* View Button */}
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
  );
};

export default WeatherStationSelector;