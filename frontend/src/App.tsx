import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore.js';
import api from './services/api.js';

import { AppLayout } from './components/layout/AppLayout.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CurrentlyInsidePage } from './pages/CurrentlyInsidePage.js';
import { GateScanPage } from './pages/GateScanPage.js';
import { NewVisitPage } from './pages/NewVisitPage.js';
import { PreRegisterPage } from './pages/PreRegisterPage.js';
import { VisitsPage } from './pages/VisitsPage.js';
import { VisitorsDirectoryPage } from './pages/VisitorsDirectoryPage.js';
import { ApprovalsPage } from './pages/ApprovalsPage.js';
import { EmployeesPage } from './pages/EmployeesPage.js';
import { DepartmentsPage } from './pages/DepartmentsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { AuditLogsPage } from './pages/AuditLogsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { PassVerifyPage } from './pages/PassVerifyPage.js';

export const App: React.FC = () => {
  const { token, setUser, logout } = useAuthStore();

  // Validate active token on initial mount
  useEffect(() => {
    if (token) {
      api.get('/api/auth/me')
        .then((res) => {
          if (res.data.success) {
            setUser(res.data.data);
          } else {
            logout();
          }
        })
        .catch(() => {
          logout();
        });
    } else {
      useAuthStore.setState({ isLoading: false });
    }
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/v/:token" element={<PassVerifyPage />} />

        {/* Protected App Routes */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/visits/currently-inside" element={<CurrentlyInsidePage />} />
          <Route path="/gate-scan" element={<GateScanPage />} />
          <Route path="/visits/new" element={<NewVisitPage />} />
          <Route path="/visits/pre-register" element={<PreRegisterPage />} />
          <Route path="/visits" element={<VisitsPage />} />
          <Route path="/visitors" element={<VisitorsDirectoryPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/directory/employees" element={<EmployeesPage />} />
          <Route path="/directory/departments" element={<DepartmentsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
