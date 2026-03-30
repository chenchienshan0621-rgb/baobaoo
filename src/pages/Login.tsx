import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Baby, Leaf, Cloud } from 'lucide-react';

export function Login() {
  const { user, profile, loading, signIn, setRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e6f2e6]">
        <div className="animate-bounce">
          <Leaf className="w-12 h-12 text-[#5c8a5c]" />
        </div>
      </div>
    );
  }

  if (user && profile?.role) {
    return <Navigate to={profile.role === 'nanny' ? '/nanny/dashboard' : '/parent/dashboard'} replace />;
  }

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2560&auto=format&fit=crop")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Soft overlay to make text readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-black/40 backdrop-blur-[2px]"></div>

      {/* Decorative clouds */}
      <Cloud className="absolute top-20 left-20 w-32 h-32 text-white/40 animate-[pulse_8s_ease-in-out_infinite]" />
      <Cloud className="absolute top-40 right-32 w-24 h-24 text-white/30 animate-[pulse_10s_ease-in-out_infinite_1s]" />

      <div className="relative z-10 max-w-md w-full bg-white/80 backdrop-blur-md rounded-[2rem] shadow-2xl overflow-hidden border border-white/50" style={{ animation: 'float 6s ease-in-out infinite' }}>
        <style>
          {`
            @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
          `}
        </style>
        
        <div className="bg-gradient-to-br from-[#8ba888]/80 to-[#5c8a5c]/80 p-10 text-center relative overflow-hidden">
          {/* Decorative leaf */}
          <Leaf className="absolute -bottom-4 -right-4 w-24 h-24 text-white/20 rotate-45" />
          
          <div className="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_8px_16px_rgba(0,0,0,0.1)] relative z-10">
            <Baby className="w-10 h-10 text-[#5c8a5c]" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wider" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
            香香媽媽寶貝日誌
          </h1>
          <p className="text-white/90 mt-3 font-medium tracking-wide">
            記錄每一個如魔法般的成長瞬間
          </p>
        </div>

        <div className="p-10 bg-white/60">
          {!user ? (
            <button
              onClick={signIn}
              className="w-full flex items-center justify-center space-x-3 bg-white border-2 border-[#8ba888]/30 text-[#4a6b4a] px-6 py-4 rounded-2xl hover:bg-[#f0f5f0] hover:border-[#8ba888] transition-all duration-300 shadow-sm hover:shadow-md font-bold text-lg group"
            >
              <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>使用 Google 登入</span>
            </button>
          ) : (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-center text-[#4a6b4a] mb-8">請選擇您的身分</h2>
              <button
                onClick={() => setRole('nanny')}
                className="w-full bg-gradient-to-r from-[#8ba888] to-[#5c8a5c] text-white px-6 py-4 rounded-2xl hover:from-[#7a9877] hover:to-[#4b7a4b] transition-all duration-300 shadow-md hover:shadow-lg font-bold text-lg transform hover:-translate-y-1"
              >
                我是保母
              </button>
              <button
                onClick={() => setRole('parent')}
                className="w-full bg-white border-2 border-[#8ba888]/30 text-[#4a6b4a] px-6 py-4 rounded-2xl hover:bg-[#f0f5f0] hover:border-[#8ba888] transition-all duration-300 shadow-sm hover:shadow-md font-bold text-lg transform hover:-translate-y-1"
              >
                我是家長
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
