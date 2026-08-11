import { useEffect, useState } from 'react';
import { RefreshCw, Download, TrendingUp, MousePointerClick, Eye, DollarSign, Bell, Zap, BarChart3, AlertTriangle, Users as UsersIcon, Link2, Megaphone, Activity } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { accountsApi, settingsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function fmtNum(n) {
  const v = Number(n) || 0;
  if (!isFinite(v)) return '0';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString();
}

const fmtCurrency = (n) => {
  const v = Number(n) || 0;
  if (!isFinite(v)) return '$0.00';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
};

export default function DashboardPage() {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState(true);

  // OAuth return lands here with the token parked in sessionStorage by
  // index.html. Save it FIRST and only then load stats, otherwise the
  // dashboard reads "not connected" while the save is still in flight.
  useEffect(() => {
    const pendingToken = sessionStorage.getItem('pending_google_token');
    if (pendingToken) {
      sessionStorage.removeItem('pending_google_token');
      settingsApi
        .saveToken({ refresh_token: pendingToken })
        .then(() => showToast('Google Ads account connected!'))
        .catch((err) => showToast(err.response?.data?.message || 'Failed to connect Google Ads', 'error'))
        .finally(loadData);
    } else {
      loadData();
    }
  }, []);

  const loadData = () => {
    setLoading(true);
    accountsApi
      .stats()
      .then((data) => {
        setStats(data);
        // Backend reports the caller's own Google Ads connection state.
        setConnected(data.googleAds?.connected !== false);
      })
      .catch((err) => {
        if (err.response?.status === 400) setConnected(false);
      })
      .finally(() => setLoading(false));
  };

  const handleSync = () => {
    setSyncing(true);
    accountsApi
      .syncGoogleAds()
      .then(() => showToast('Sync started! Refresh after 1-2 minutes.'))
      .catch((err) => showToast(err.response?.data?.message || 'Sync failed', 'error'))
      .finally(() => setSyncing(false));
  };

  const metricCards = stats
    ? [
        // Admin sees system-wide user totals; a user sees their own
        // Google Ads connection status ("My Google Ads").
        ...(isAdmin
          ? [{ icon: UsersIcon, label: 'Total Users', value: fmtNum(stats.users?.total), sub: `${stats.users?.googleAdsConnected || 0} connected · ${stats.users?.active || 0} active`, color: '#0ea5e9' }]
          : [{ icon: Link2, label: 'My Google Ads', value: connected ? 'Connected' : 'Not Connected', sub: connected ? 'Account linked & active' : 'Connect from Settings', color: connected ? '#22c55e' : '#ef4444' }]),
        { icon: BarChart3, label: 'Total Accounts', value: fmtNum(stats.accounts?.total), sub: `${stats.accounts?.mccIds?.length || 0} MCC`, color: '#6366f1' },
        // Second role-specific card so both views land on 8 cards (2 rows of
        // 4): admin gets Active Accounts, a user gets Total Campaigns.
        ...(isAdmin
          ? [{ icon: Activity, label: 'Active Accounts', value: fmtNum(stats.accounts?.withActiveCampaigns), sub: `${fmtNum(stats.accounts?.allPaused)} all paused · ${fmtNum(stats.accounts?.noCampaigns)} no campaigns`, color: '#14b8a6' }]
          : []),
        { icon: Zap, label: 'Active Campaigns', value: fmtNum(stats.campaigns?.enabled), sub: `${fmtNum(stats.campaigns?.paused)} paused · ${fmtNum(stats.campaigns?.total)} total`, color: '#10b981' },
        ...(!isAdmin
          ? [{ icon: Megaphone, label: 'Total Campaigns', value: fmtNum(stats.campaigns?.total), sub: `${fmtNum(stats.campaigns?.enabled)} enabled · ${fmtNum(stats.campaigns?.paused)} paused`, color: '#14b8a6' }]
          : []),
        { icon: DollarSign, label: 'Total Spend', value: fmtCurrency(stats.metrics?.totalSpend), sub: 'Last 30 days', color: '#f59e0b' },
        { icon: MousePointerClick, label: 'Total Clicks', value: fmtNum(stats.metrics?.totalClicks), sub: `CPC: ${fmtCurrency(stats.metrics?.avgCpc)}`, color: '#3b82f6' },
        { icon: Eye, label: 'Impressions', value: fmtNum(stats.metrics?.totalImpressions), sub: `CTR: ${stats.metrics?.avgCtr || 0}%`, color: '#8b5cf6' },
        { icon: Bell, label: 'Alerts', value: fmtNum(stats.alerts?.total), sub: `${stats.alerts?.activeRules || 0} active rules`, color: '#ef4444' },
      ]
    : [];

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Google Ads Overview"
        actions={
          <div className="header-btn-group">
            <button className="refresh-btn" onClick={handleSync} disabled={syncing || !connected}>
              <Download size={15} />
              {syncing ? 'Syncing...' : 'Sync from Google'}
            </button>
            <button className="refresh-btn" onClick={loadData} disabled={loading}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Connecting is optional for admins (they already see every user's
          data), so the nag banner is for regular users only. */}
      {!connected && !isAdmin && (
        <div className="error-banner">
          Google Ads not connected. Go to Settings and click Connect with Google.
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading dashboard..." />
      ) : stats ? (
        <>
          {/* Row 1 & 2: 6 Metric Cards — 3 per row */}
          <div className="dashboard-metrics-grid">
            {metricCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="dash-metric-card"
                  style={{
                    background: `linear-gradient(135deg, ${card.color}15, ${card.color}08)`,
                    borderLeft: `4px solid ${card.color}`,
                  }}
                >
                  <div className="dash-metric-label">
                    <Icon size={16} /> {card.label}
                  </div>
                  <div className="dash-metric-value">{card.value}</div>
                  <div className="dash-metric-sub">{card.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Row 3: Account Status + Conversions & Performance */}
          <div className="dashboard-two-col">
            <div className="stat-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Account Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Active Campaigns', value: stats.accounts?.withActiveCampaigns || 0, color: '#10b981' },
                  { label: 'All Paused', value: stats.accounts?.allPaused || 0, color: '#f59e0b' },
                  { label: 'No Campaigns', value: stats.accounts?.noCampaigns || 0, color: '#6366f1' },
                  { label: 'Manager', value: stats.accounts?.managers || 0, color: '#3b82f6' },
                ].map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                      <span>{s.label}</span>
                    </div>
                    <strong>{s.value}</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 13, opacity: 0.6 }}>
                MCC: {stats.accounts?.mccIds?.join(', ') || '-'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                Last Synced: {stats.accounts?.lastSynced ? new Date(stats.accounts.lastSynced).toLocaleString() : 'Never'}
              </div>
            </div>

            <div className="stat-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Conversions & Performance</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Total Conversions', value: fmtNum(stats.metrics?.totalConversions), bold: true },
                  { label: 'Avg. CPC', value: fmtCurrency(stats.metrics?.avgCpc) },
                  { label: 'CTR', value: (stats.metrics?.avgCtr || 0) + '%' },
                  { label: 'Total Campaigns', value: fmtNum(stats.campaigns?.total) },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ opacity: 0.7 }}>{row.label}</span>
                    <strong style={row.bold ? { fontSize: 20 } : {}}>{row.value}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ opacity: 0.7 }}>Enabled</span>
                  <span className="status-badge status-active">{stats.campaigns?.enabled ?? 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ opacity: 0.7 }}>Paused</span>
                  <span className="status-badge status-paused">{stats.campaigns?.paused ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin only: per-user performance breakdown */}
          {isAdmin && stats.userBreakdown?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <div className="section-heading">
                <h2><UsersIcon size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />User-wise Performance</h2>
                <span className="section-count">{stats.userBreakdown.length}</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Google Ads</th>
                      <th>Accounts</th>
                      <th>Campaigns</th>
                      <th>Spend</th>
                      <th>Clicks</th>
                      <th>Conversions</th>
                      <th>Last Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.userBreakdown.map((u) => (
                      <tr key={u.userId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.6 }}>{u.email}</div>
                        </td>
                        <td>
                          <span className={`status-badge status-${u.role === 'admin' ? 'active' : 'pending'}`}>{u.role}</span>
                        </td>
                        <td>
                          <span className={`status-badge status-${u.googleAdsConnected ? 'active' : 'paused'}`}>
                            {u.googleAdsConnected ? 'Connected' : 'Not Connected'}
                          </span>
                        </td>
                        <td>{u.accounts}</td>
                        <td>{u.campaigns}</td>
                        <td>{fmtCurrency(u.spend)}</td>
                        <td>{fmtNum(u.clicks)}</td>
                        <td>{fmtNum(u.conversions)}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 13, opacity: 0.7 }}>
                          {u.lastSynced ? new Date(u.lastSynced).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Row 4: Recent Alerts */}
          {stats.alerts?.recent?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <div className="section-heading">
                <h2><AlertTriangle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Recent Alerts</h2>
                <span className="section-count">{stats.alerts.total}</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Rule Type</th>
                      <th>Recommendation</th>
                      <th>Message</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.alerts.recent.map((a, i) => (
                      <tr key={a._id || i}>
                        <td style={{ fontWeight: 600 }}>{a.campaignName || '-'}</td>
                        <td>
                          <span className={`status-badge status-${a.ruleType === 'SPEND_LIMIT' ? 'paused' : a.ruleType === 'HIGH_CLICKS_LOW_GCLID' ? 'failed' : 'pending'}`}>
                            {a.ruleType}
                          </span>
                        </td>
                        <td>{a.recommendation || '-'}</td>
                        <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.message || '-'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 13, opacity: 0.7 }}>
                          {a.createdAt ? new Date(a.createdAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Row 5: Top Campaigns by Spend */}
          {stats.topCampaigns?.length > 0 && (
            <section>
              <div className="section-heading">
                <h2><TrendingUp size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Top Campaigns by Spend</h2>
                <span className="section-count">{stats.topCampaigns.length}</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Campaign Name</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th>Spend</th>
                      <th>Clicks</th>
                      <th>Impressions</th>
                      <th>Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCampaigns.map((c, i) => (
                      <tr key={c.campaignId || i}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{c.campaignName || '-'}</td>
                        <td className="info-value mono">{c.accountName || c.customerId || '-'}</td>
                        <td>
                          <span className={`status-badge status-${c.status === 'ENABLED' ? 'active' : c.status === 'PAUSED' ? 'paused' : 'pending'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>{fmtCurrency(c.spend)}</td>
                        <td>{fmtNum(c.clicks)}</td>
                        <td>{fmtNum(c.impressions)}</td>
                        <td>{fmtNum(c.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {stats.accounts?.total === 0 && (
            <div className="all-clear" style={{ textAlign: 'center', padding: 40 }}>
              <p>No data yet. Click <strong>Sync from Google</strong> to fetch all accounts from your MCC.</p>
              <p style={{ opacity: 0.6, marginTop: 8 }}>First sync takes 1-2 minutes.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
