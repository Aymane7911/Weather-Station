'use client'

import React, { useState, useEffect } from 'react';
import { Users, Shield, Check, X, Search, Loader2, AlertCircle, CheckCircle, XCircle, Cloud, ArrowLeft, RefreshCw, Home, Settings, LayoutDashboard, Menu, ChevronRight } from 'lucide-react';

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
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [containersLoading, setContainersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingContainers, setProcessingContainers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/me');
      
      if (!response.ok) {
        setIsAuthorized(false);
        return;
      }

      const data = await response.json();
      const isAdmin = data.user?.isAdmin || false;
      
      if (isAdmin) {
        setIsAuthorized(true);
        fetchUsers();
        fetchContainers();
      } else {
        setIsAuthorized(false);
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/users');
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Unauthorized. Admin access required.');
        }
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchContainers = async () => {
    try {
      setContainersLoading(true);
      const response = await fetch('/api/containers/list');
      
      if (!response.ok) {
        throw new Error('Failed to fetch containers');
      }

      const data = await response.json();
      setContainers(data.containers || []);
    } catch (err) {
      console.error('Error fetching containers:', err);
    } finally {
      setContainersLoading(false);
    }
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

      if (!response.ok) {
        throw new Error('Failed to grant access');
      }

      setSuccessMessage(`Access granted to ${containerName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      await fetchUsers();
      
      if (selectedUser?.id === userId) {
        const updatedUser = users.find(u => u.id === userId);
        if (updatedUser) {
          setSelectedUser(updatedUser);
        }
      }
    } catch (err) {
      console.error('Error granting access:', err);
      setError(err instanceof Error ? err.message : 'Failed to grant access');
      setTimeout(() => setError(null), 3000);
    } finally {
      setProcessingContainers(prev => {
        const newSet = new Set(prev);
        newSet.delete(containerName);
        return newSet;
      });
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

      if (!response.ok) {
        throw new Error('Failed to revoke access');
      }

      setSuccessMessage(`Access revoked from ${containerName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      await fetchUsers();
      
      if (selectedUser?.id === userId) {
        const updatedUser = users.find(u => u.id === userId);
        if (updatedUser) {
          setSelectedUser(updatedUser);
        }
      }
    } catch (err) {
      console.error('Error revoking access:', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
      setTimeout(() => setError(null), 3000);
    } finally {
      setProcessingContainers(prev => {
        const newSet = new Set(prev);
        newSet.delete(containerName);
        return newSet;
      });
    }
  };

  const hasAccessToContainer = (user: User, containerName: string) => {
    return user.containerAccess.some(ca => ca.containerName === containerName);
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.name && user.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Loading state
  if (loading && isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 border-4 border-purple-300/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-purple-400 rounded-full border-t-transparent animate-spin"></div>
            <Shield className="w-12 h-12 text-purple-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-2xl font-bold text-white mb-2">Loading Admin Panel</p>
          <p className="text-purple-300">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Unauthorized state
  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl p-8 border border-red-500/30 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl mb-6 shadow-lg shadow-red-500/50 mx-auto">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black text-white mb-2">
              Access Denied
            </h1>
            <p className="text-gray-400 mb-8">
              You don't have permission to access the admin panel. Only administrators can access this page.
            </p>
            <button
              onClick={() => window.location.href = '/selection'}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3.5 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gradient-to-b from-slate-900/90 to-slate-800/90 backdrop-blur-xl border-r border-purple-500/20 transition-all duration-300 flex flex-col`}>
        {/* Sidebar Header */}
        <div className="p-6 border-b border-purple-500/20">
          <div className="flex items-center justify-between">
            {sidebarOpen ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg shadow-lg shadow-purple-500/50">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Admin</h2>
                  <p className="text-purple-300 text-xs">Control Panel</p>
                </div>
              </div>
            ) : (
              <div className="mx-auto p-2 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg shadow-lg shadow-purple-500/50">
                <Shield className="w-6 h-6 text-white" />
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-purple-300 hover:text-white transition-colors ml-2"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => window.location.href = '/selection'}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-purple-300 hover:text-white hover:bg-purple-500/20 transition-all group"
          >
            <Home className="w-5 h-5" />
            {sidebarOpen && <span className="font-semibold">Home</span>}
            {sidebarOpen && <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-white border border-purple-500/30 shadow-lg shadow-purple-500/10"
          >
            <LayoutDashboard className="w-5 h-5" />
            {sidebarOpen && <span className="font-semibold">Dashboard</span>}
          </button>

        

          
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-purple-500/20">
          <button
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                window.location.href = '/';
              });
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-red-500/20 to-orange-500/20 text-red-300 hover:text-red-200 hover:from-red-500/30 hover:to-orange-500/30 transition-all border border-red-500/30 ${!sidebarOpen && 'justify-center'}`}
          >
            <ArrowLeft className="w-5 h-5" />
            {sidebarOpen && <span className="font-semibold">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-xl border-b border-purple-500/20 sticky top-0 z-20">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
                  Access Management
                </h1>
                <p className="text-purple-300 mt-1">Manage user access to weather stations</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.location.href = '/selection'}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-cyan-700 transition-all duration-300 shadow-lg shadow-indigo-500/30 font-semibold"
                >
                  <Home className="w-4 h-4" />
                  Home
                </button>
                <button
                  onClick={fetchUsers}
                  className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg shadow-purple-500/30 font-semibold"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Notifications */}
        {(error || successMessage) && (
          <div className="fixed top-24 right-8 z-50 animate-in slide-in-from-right space-y-2">
            {error && (
              <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 backdrop-blur-xl border border-red-500/30 text-red-200 px-6 py-4 rounded-2xl shadow-2xl shadow-red-500/20 flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">{error}</span>
              </div>
            )}
            {successMessage && (
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-xl border border-green-500/30 text-green-200 px-6 py-4 rounded-2xl shadow-2xl shadow-green-500/20 flex items-center gap-3">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">{successMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Users List */}
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg shadow-lg shadow-purple-500/50">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  Users ({users.length})
                </h2>
              </div>

              {/* Search */}
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-purple-500/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-white placeholder-purple-300/50"
                />
              </div>

              {/* Users List */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-purple-500/30 mx-auto mb-4" />
                    <p className="text-purple-300">No users found</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        selectedUser?.id === user.id
                          ? 'border-purple-500 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 shadow-lg shadow-purple-500/20'
                          : 'border-purple-500/20 hover:border-purple-500/50 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-white">
                              {user.name || 'No name'}
                            </h3>
                            {user.isAdmin && (
                              <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-semibold rounded-full shadow-lg shadow-purple-500/30">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-purple-300 mb-2">{user.email}</p>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={`flex items-center gap-1 ${
                              user.emailVerified ? 'text-green-400' : 'text-gray-500'
                            }`}>
                              {user.emailVerified ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {user.emailVerified ? 'Verified' : 'Not verified'}
                            </span>
                            <span className={`flex items-center gap-1 ${
                              user.isAccessGranted ? 'text-blue-400' : 'text-gray-500'
                            }`}>
                              {user.isAccessGranted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {user.isAccessGranted ? 'Has Access' : 'No Access'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-purple-400 font-semibold bg-purple-500/20 px-2 py-1 rounded-lg">
                            {user.containerAccess.length} station{user.containerAccess.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Container Access Management */}
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-purple-500/20 p-6">
              {selectedUser ? (
                <>
                  <div className="mb-6 pb-6 border-b border-purple-500/20">
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {selectedUser.name || 'No name'}
                    </h2>
                    <p className="text-purple-300 mb-3">{selectedUser.email}</p>
                    <div className="flex items-center gap-2">
                      {selectedUser.isAdmin && (
                        <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-purple-500/30">
                          Admin User
                        </span>
                      )}
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                        selectedUser.isAccessGranted
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30'
                          : 'bg-slate-700 text-gray-300'
                      }`}>
                        {selectedUser.isAccessGranted ? 'Access Granted' : 'No Access'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg shadow-lg shadow-indigo-500/50">
                      <Cloud className="w-4 h-4 text-white" />
                    </div>
                    Weather Stations
                  </h3>

                  {containersLoading ? (
                    <div className="text-center py-12">
                      <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                      <p className="text-purple-300">Loading stations...</p>
                    </div>
                  ) : containers.length === 0 ? (
                    <div className="text-center py-12">
                      <Cloud className="w-16 h-16 text-purple-500/30 mx-auto mb-4" />
                      <p className="text-purple-300">No stations available</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                      {containers.map((container) => {
                        const hasAccess = hasAccessToContainer(selectedUser, container.name);
                        const isProcessing = processingContainers.has(container.name);

                        return (
                          <div
                            key={container.name}
                            className="flex items-center justify-between p-4 rounded-2xl border-2 border-purple-500/20 hover:border-purple-500/50 transition-all bg-slate-800/30"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                hasAccess ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30' : 'bg-slate-700'
                              }`}>
                                <Cloud className={`w-5 h-5 ${
                                  hasAccess ? 'text-white' : 'text-gray-400'
                                }`} />
                              </div>
                              <div>
                                <h4 className="font-semibold text-white">
                                  {container.name.replace('ws-', '').replace(/-/g, ' ')
                                    .split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ')}
                                </h4>
                                <p className="text-xs text-purple-400 font-mono">{container.name}</p>
                              </div>
                            </div>

                            <button
                              onClick={() => hasAccess 
                                ? handleRevokeAccess(selectedUser.id, container.name)
                                : handleGrantAccess(selectedUser.id, container.name)
                              }
                              disabled={isProcessing}
                              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg ${
                                hasAccess
                                  ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-red-500/30'
                                  : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-green-500/30'
                              }`}
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : hasAccess ? (
                                <X className="w-4 h-4" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
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
                  <Users className="w-20 h-20 text-purple-500/30 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Select a User</h3>
                  <p className="text-purple-300">Choose a user from the list to manage their station access</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAccessManagement;