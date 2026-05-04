'use client'

import React, { useState, useEffect } from 'react';
import { Users, Shield, Check, X, Search, Loader2, AlertCircle, CheckCircle, XCircle, Cloud, ArrowLeft, RefreshCw, MapPin } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isAccessGranted: boolean;
  emailVerified: boolean;
  createdAt: string;
  containerAccess: {
    containerName: string;
    grantedAt: string;
  }[];
}

interface Container {
  name: string;
}

const AdminAccessManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [containersLoading, setContainersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingContainers, setProcessingContainers] = useState<Set<string>>(new Set());

  // Coordinates state — keyed by containerName
  const [coords, setCoords] = useState<Record<string, { lat: string; lng: string }>>({});

  useEffect(() => {
    fetchUsers();
    fetchContainers();
  }, []);

  // Load saved coords from localStorage when containers are fetched
  useEffect(() => {
    if (containers.length === 0) return;
    const loaded: Record<string, { lat: string; lng: string }> = {};
    containers.forEach(c => {
      loaded[c.name] = {
        lat: localStorage.getItem(`station_lat_${c.name}`) || '',
        lng: localStorage.getItem(`station_lng_${c.name}`) || '',
      };
    });
    setCoords(loaded);
  }, [containers]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        if (response.status === 403) throw new Error('Unauthorized. Admin access required.');
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchContainers = async () => {
    try {
      setContainersLoading(true);
      const response = await fetch('/api/containers/list');
      if (!response.ok) throw new Error('Failed to fetch containers');
      const data = await response.json();
      setContainers(data.containers || []);
    } catch (err) {
      console.error('Error fetching containers:', err);
    } finally {
      setContainersLoading(false);
    }
  };

  const handleSaveCoords = (containerName: string) => {
    const c = coords[containerName];
    if (!c) return;
    const lat = parseFloat(c.lat);
    const lng = parseFloat(c.lng);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please enter valid latitude and longitude values.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    localStorage.setItem(`station_lat_${containerName}`, c.lat);
    localStorage.setItem(`station_lng_${containerName}`, c.lng);
    setSuccessMessage(`Location saved for ${containerName}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleGrantAccess = async (userId: string, containerName: string) => {
    try {
      setProcessingContainers(prev => new Set(prev).add(containerName));
      setError(null);
      const response = await fetch('/api/admin/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, containerName }),
      });
      if (!response.ok) throw new Error('Failed to grant access');
      setSuccessMessage(`Access granted to ${containerName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = users.find(u => u.id === userId);
        if (updatedUser) setSelectedUser(updatedUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
      setTimeout(() => setError(null), 3000);
    } finally {
      setProcessingContainers(prev => { const s = new Set(prev); s.delete(containerName); return s; });
    }
  };

  const handleRevokeAccess = async (userId: string, containerName: string) => {
    try {
      setProcessingContainers(prev => new Set(prev).add(containerName));
      setError(null);
      const response = await fetch('/api/admin/revoke-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, containerName }),
      });
      if (!response.ok) throw new Error('Failed to revoke access');
      setSuccessMessage(`Access revoked from ${containerName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = users.find(u => u.id === userId);
        if (updatedUser) setSelectedUser(updatedUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
      setTimeout(() => setError(null), 3000);
    } finally {
      setProcessingContainers(prev => { const s = new Set(prev); s.delete(containerName); return s; });
    }
  };

  const hasAccessToContainer = (user: User, containerName: string) =>
    user.containerAccess.some(ca => ca.containerName === containerName);

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.name && user.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 border-4 border-purple-200 rounded-full"/>
            <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"/>
            <Shield className="w-12 h-12 text-purple-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-2xl font-bold text-gray-700 mb-2">Loading Admin Panel</p>
          <p className="text-gray-500">Fetching user data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => window.location.href = '/selection'} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <Shield className="w-8 h-8 text-purple-600" />
                  <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">
                    Access Management
                  </h1>
                </div>
                <p className="text-sm text-gray-500 mt-1">Manage user access and station locations</p>
              </div>
            </div>
            <button onClick={fetchUsers} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md font-semibold text-sm">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Notifications */}
      {(error || successMessage) && (
        <div className="fixed top-24 right-4 z-50">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 mb-2">
              <AlertCircle className="w-5 h-5" /><span className="font-semibold">{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5" /><span className="font-semibold">{successMessage}</span>
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">

        {/* ── Row 1: Users + Access ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Users List */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-6">
              <Users className="w-6 h-6 text-purple-600" /> Users ({users.length})
            </h2>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text" placeholder="Search users..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No users found</p>
                </div>
              ) : filteredUsers.map(user => (
                <div key={user.id} onClick={() => setSelectedUser(user)}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedUser?.id === user.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-800">{user.name || 'No name'}</h3>
                        {user.isAdmin && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">Admin</span>}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{user.email}</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`flex items-center gap-1 ${user.emailVerified ? 'text-green-600' : 'text-gray-400'}`}>
                          {user.emailVerified ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {user.emailVerified ? 'Verified' : 'Not verified'}
                        </span>
                        <span className={`flex items-center gap-1 ${user.isAccessGranted ? 'text-blue-600' : 'text-gray-400'}`}>
                          {user.isAccessGranted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {user.isAccessGranted ? 'Has Access' : 'No Access'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{user.containerAccess.length} station{user.containerAccess.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Container Access Management */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            {selectedUser ? (
              <>
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{selectedUser.name || 'No name'}</h2>
                  <p className="text-gray-600 mb-3">{selectedUser.email}</p>
                  <div className="flex items-center gap-2">
                    {selectedUser.isAdmin && <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-semibold rounded-full">Admin User</span>}
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${selectedUser.isAccessGranted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {selectedUser.isAccessGranted ? 'Access Granted' : 'No Access'}
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-indigo-600" /> Weather Stations
                </h3>
                {containersLoading ? (
                  <div className="text-center py-12"><Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" /><p className="text-gray-500">Loading stations...</p></div>
                ) : containers.length === 0 ? (
                  <div className="text-center py-12"><Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No stations available</p></div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {containers.map(container => {
                      const hasAccess = hasAccessToContainer(selectedUser, container.name);
                      const isProcessing = processingContainers.has(container.name);
                      return (
                        <div key={container.name} className="flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-300 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasAccess ? 'bg-green-100' : 'bg-gray-100'}`}>
                              <Cloud className={`w-5 h-5 ${hasAccess ? 'text-green-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-800">
                                {container.name.replace('ws-', '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                              </h4>
                              <p className="text-xs text-gray-500 font-mono">{container.name}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => hasAccess ? handleRevokeAccess(selectedUser.id, container.name) : handleGrantAccess(selectedUser.id, container.name)}
                            disabled={isProcessing}
                            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-2 ${hasAccess ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : hasAccess ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            {isProcessing ? 'Processing...' : hasAccess ? 'Revoke' : 'Grant'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20">
                <Users className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-600 mb-2">Select a User</h3>
                <p className="text-gray-500">Choose a user from the list to manage their station access</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Station Locations ── */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-2">
            <MapPin className="w-6 h-6 text-indigo-600" /> Station Locations
          </h2>
          <p className="text-sm text-gray-500 mb-6">Set the latitude and longitude for each station. These coordinates are used to display stations on the map in the selection page.</p>

          {containersLoading ? (
            <div className="text-center py-10"><Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" /></div>
          ) : containers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No stations found</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {containers.map(container => {
                const c = coords[container.name] || { lat: '', lng: '' };
                const displayName = container.name.replace('ws-', '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                const hasCoords = c.lat !== '' && c.lng !== '';
                return (
                  <div key={container.name} className="border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasCoords ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                        <MapPin className={`w-4 h-4 ${hasCoords ? 'text-indigo-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm">{displayName}</h4>
                        <p className="text-xs text-gray-400 font-mono">{container.name}</p>
                      </div>
                    </div>
                    <div className="space-y-2 mb-3">
                      <input
                        type="number" step="any" placeholder="Latitude (e.g. 33.5731)"
                        value={c.lat}
                        onChange={e => setCoords(prev => ({ ...prev, [container.name]: { ...prev[container.name], lat: e.target.value } }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-800"
                      />
                      <input
                        type="number" step="any" placeholder="Longitude (e.g. -7.5898)"
                        value={c.lng}
                        onChange={e => setCoords(prev => ({ ...prev, [container.name]: { ...prev[container.name], lng: e.target.value } }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-800"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveCoords(container.name)}
                      className="w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold text-xs hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Location
                    </button>
                    {hasCoords && (
                      <p className="text-center text-xs text-indigo-500 font-medium mt-2">
                        📍 {parseFloat(c.lat).toFixed(4)}, {parseFloat(c.lng).toFixed(4)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AdminAccessManagement;