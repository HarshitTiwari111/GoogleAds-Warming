import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import GoogleTokenCatcher from './components/GoogleTokenCatcher';

import Login from './pages/Login';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import AccountDetailPage from './pages/AccountDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import GoogleAdsCampaignsPage from './pages/GoogleAdsCampaignsPage';
import AudiencePage from './pages/AudiencePage';
import AlertHistoryPage from './pages/AlertHistoryPage';
import RulesPage from './pages/RulesPage';
import ReportsPage from './pages/ReportsPage';
import MonitoringPage from './pages/MonitoringPage';
import SettingsPage from './pages/SettingsPage';
import SecurityPage from './pages/SecurityPage';
import UsersPage from './pages/UsersPage';
import ProfilePage from './pages/ProfilePage';

// Ported from the warming/farming project. Keywords and Ad Copies are
// campaign-scoped sub-pages reached from a campaign, not top-level sections.
import KeywordsPage from './pages/KeywordsPage';
import AdCopiesPage from './pages/AdCopiesPage';

export default function App() {
  // Force rebuild
  return (
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            {/* Catches a refresh token the OAuth proxy appends to the URL,
                whichever route it drops the user on. */}
            <GoogleTokenCatcher />
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/monitoring" element={<MonitoringPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/accounts/:id" element={<AccountDetailPage />} />
                <Route path="/campaigns" element={<CampaignsPage />} />
                {/* Live Google Ads view: browse a synced account's campaigns and
                    edit their keywords, ads, device bids and geo targeting. */}
                <Route path="/campaigns/google-ads" element={<GoogleAdsCampaignsPage />} />
                <Route path="/campaigns/audience" element={<AudiencePage />} />

                {/* Campaign-scoped sub-pages, opened from a campaign row. */}
                <Route path="/campaigns/:campaignId/keywords" element={<KeywordsPage />} />
                <Route path="/campaigns/:campaignId/ads" element={<AdCopiesPage />} />

                <Route path="/alerts" element={<AlertHistoryPage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/profile" element={<ProfilePage />} />

                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute roles={['admin']}>
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Routes>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
