import React from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Home, Upload, Users } from 'lucide-react';

export function Layout() {
  const { user, profile, loading, signOut, setRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-50">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile?.role) {
    return <Navigate to="/login" replace />;
  }

  if (profile.role === 'parent' && !location.pathname.startsWith('/parent')) {
    return <Navigate to="/parent/dashboard" replace />;
  }

  if (profile.role === 'nanny' && !location.pathname.startsWith('/nanny')) {
    return <Navigate to="/nanny/dashboard" replace />;
  }

  if (profile.role === 'admin' && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold text-rose-500 tracking-tight">
              {profile.role === 'nanny' ? '保母日誌管理' : profile.role === 'admin' ? '網站管理後台' : '寶貝成長相簿'}
            </span>
          </div>
          
          {/* Desktop Navigation */}
          {profile.role === 'nanny' && (
            <nav className="hidden sm:flex items-center space-x-1">
              <Link 
                to="/nanny/dashboard" 
                className={`px-4 py-2 rounded-full font-medium flex items-center space-x-2 transition-colors ${
                  isActive('/nanny/dashboard') 
                    ? 'bg-rose-50 text-rose-600' 
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                }`}
              >
                <Home className="w-4 h-4" />
                <span>日誌總覽</span>
              </Link>
              <Link 
                to="/nanny/upload" 
                className={`px-4 py-2 rounded-full font-medium flex items-center space-x-2 transition-colors ${
                  isActive('/nanny/upload') 
                    ? 'bg-rose-50 text-rose-600' 
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>新增日誌</span>
              </Link>
              <Link 
                to="/nanny/toddlers" 
                className={`px-4 py-2 rounded-full font-medium flex items-center space-x-2 transition-colors ${
                  isActive('/nanny/toddlers') 
                    ? 'bg-rose-50 text-rose-600' 
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>幼兒管理</span>
              </Link>
            </nav>
          )}

          {profile.role === 'admin' && (
            <nav className="hidden sm:flex items-center space-x-1">
              <Link 
                to="/admin/dashboard" 
                className={`px-4 py-2 rounded-full font-medium flex items-center space-x-2 transition-colors ${
                  isActive('/admin/dashboard') 
                    ? 'bg-rose-50 text-rose-600' 
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>帳號管理</span>
              </Link>
            </nav>
          )}

          <div className="flex items-center space-x-4">
            {user?.email === 'chen.chienshan0621@gmail.com' && (
              <div className="hidden sm:flex items-center space-x-2 mr-2">
                <select 
                  value={profile.role} 
                  onChange={(e) => setRole(e.target.value as any)}
                  className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-purple-300"
                >
                  <option value="admin">切換為: 管理者</option>
                  <option value="nanny">切換為: 保母</option>
                  <option value="parent">切換為: 家長</option>
                </select>
              </div>
            )}
            <span className="text-sm font-medium text-stone-600 hidden sm:block bg-stone-100 px-3 py-1 rounded-full">
              {profile.name}
            </span>
            <button
              onClick={signOut}
              className="p-2 text-stone-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors"
              title="登出"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 sm:pb-8">
        {user?.email === 'chen.chienshan0621@gmail.com' && (
          <div className="sm:hidden mb-4 flex justify-end">
            <select 
              value={profile.role} 
              onChange={(e) => setRole(e.target.value as any)}
              className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-300 w-full"
            >
              <option value="admin">切換為: 管理者</option>
              <option value="nanny">切換為: 保母</option>
              <option value="parent">切換為: 家長</option>
            </select>
          </div>
        )}
        <Outlet />
      </main>

      {/* Mobile Navigation */}
      {profile.role === 'nanny' && (
        <nav className="bg-white border-t border-stone-200 fixed bottom-0 w-full sm:hidden z-20 pb-safe">
          <div className="flex justify-around">
            <Link 
              to="/nanny/dashboard" 
              className={`p-4 flex flex-col items-center flex-1 transition-colors ${
                isActive('/nanny/dashboard') ? 'text-rose-500' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <Home className="w-6 h-6" />
              <span className="text-[10px] mt-1 font-medium">總覽</span>
            </Link>
            <Link 
              to="/nanny/upload" 
              className={`p-4 flex flex-col items-center flex-1 transition-colors ${
                isActive('/nanny/upload') ? 'text-rose-500' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <Upload className="w-6 h-6" />
              <span className="text-[10px] mt-1 font-medium">新增</span>
            </Link>
            <Link 
              to="/nanny/toddlers" 
              className={`p-4 flex flex-col items-center flex-1 transition-colors ${
                isActive('/nanny/toddlers') ? 'text-rose-500' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <Users className="w-6 h-6" />
              <span className="text-[10px] mt-1 font-medium">幼兒</span>
            </Link>
          </div>
        </nav>
      )}
      {profile.role === 'admin' && (
        <nav className="bg-white border-t border-stone-200 fixed bottom-0 w-full sm:hidden z-20 pb-safe">
          <div className="flex justify-around">
            <Link 
              to="/admin/dashboard" 
              className={`p-4 flex flex-col items-center flex-1 transition-colors ${
                isActive('/admin/dashboard') ? 'text-rose-500' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <Users className="w-6 h-6" />
              <span className="text-[10px] mt-1 font-medium">帳號管理</span>
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
