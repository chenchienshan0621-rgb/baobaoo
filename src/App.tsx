import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { NannyDashboard } from './pages/nanny/Dashboard';
import { NannyUpload } from './pages/nanny/Upload';
import { NannyToddlers } from './pages/nanny/Toddlers';
import { ParentDashboard } from './pages/parent/Dashboard';
import { AdminDashboard } from './pages/admin/Dashboard';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="nanny">
              <Route path="dashboard" element={<NannyDashboard />} />
              <Route path="upload" element={<NannyUpload />} />
              <Route path="toddlers" element={<NannyToddlers />} />
            </Route>
            <Route path="parent">
              <Route path="dashboard" element={<ParentDashboard />} />
            </Route>
            <Route path="admin">
              <Route path="dashboard" element={<AdminDashboard />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
