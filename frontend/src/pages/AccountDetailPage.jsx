import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import PerformanceChart from '../components/PerformanceChart';
import ReportTable from '../components/ReportTable';
import { accountsApi, campaignsApi, performanceApi, reportsApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function AccountDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [account, setAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [accountRes, campaignsRes, performanceRes, summaryRes, reportsRes] = await Promise.all([
        accountsApi.get(id),
        campaignsApi.getByAccount(id),
        performanceApi.getByAccount(id),
        performanceApi.summary(id),
        reportsApi.getByAccount(id),
      ]);
      setAccount(unwrap(accountRes));
      setCampaigns(unwrap(campaignsRes) || []);
      setPerformance(unwrap(performanceRes) || []);
      setSummary(unwrap(summaryRes));
      setReports(unwrap(reportsRes) || []);
      setLastUpdated(new Date());
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await accountsApi.sync(id);
      showToast('Sync started - refreshing data');
      await loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to sync account', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingSpinner label="Loading account…" fullHeight />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <PageHeader title="Account Not Found" subtitle="This account may have been deleted" />
        <div className="error-banner">No account exists with this ID.</div>
        <Link to="/accounts" className="btn-secondary-outline">
          <ArrowLeft size={15} />
          Back to Accounts
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHeader title="Account" />
        <div className="error-banner">
          Could not load this account. Is the backend server running? ({error.message})
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={account?.accountName}
        subtitle="Account details, campaigns, performance & reports"
        lastUpdated={lastUpdated}
        actions={
          <button className="btn-secondary-outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={15} />
            {syncing ? 'Syncing…' : 'Sync Data'}
          </button>
        }
      />

      <div className="panel-grid">
        <div className="panel-card">
          <h3>Account Info</h3>
          <div className="info-list">
            <div className="info-list-row">
              <span className="info-label">Status</span>
              <span className="info-value">
                <StatusBadge status={account?.status} />
              </span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Client Name</span>
              <span className="info-value">{account?.clientName}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Client Email</span>
              <span className="info-value">{account?.clientEmail}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Industry</span>
              <span className="info-value">{account?.industry || '-'}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Website</span>
              <span className="info-value">{account?.website || '-'}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Google Ads ID</span>
              <span className="info-value mono">{account?.googleAdsCustomerId || '-'}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Currency</span>
              <span className="info-value">{account?.currency || 'INR'}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Time Zone</span>
              <span className="info-value">{account?.timeZone || 'Asia/Kolkata'}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Created</span>
              <span className="info-value">
                {account?.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}
              </span>
            </div>
          </div>
        </div>

        <div className="panel-card">
          <h3>Performance Summary</h3>
          <div className="info-list">
            <div className="info-list-row">
              <span className="info-label">Total Spend</span>
              <span className="info-value">{formatCurrency(summary?.totalSpend)}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Total Clicks</span>
              <span className="info-value">{summary?.totalClicks?.toLocaleString() ?? 0}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Total Impressions</span>
              <span className="info-value">{summary?.totalImpressions?.toLocaleString() ?? 0}</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Avg CTR</span>
              <span className="info-value">{summary?.avgCtr?.toFixed(2) ?? '0.00'}%</span>
            </div>
            <div className="info-list-row">
              <span className="info-label">Avg CPC</span>
              <span className="info-value">{formatCurrency(summary?.avgCpc)}</span>
            </div>
          </div>
        </div>
      </div>

      <section>
        <div className="section-heading">
          <h2>Campaigns</h2>
          <span className="section-count">{campaigns.length}</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Spend</th>
                <th>Clicks</th>
                <th>Daily Budget</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaignId || c._id}>
                  <td>{c.campaignName}</td>
                  <td>
                    <StatusBadge status={c.status || c.campaignStatus} />
                  </td>
                  <td>{formatCurrency(c.spend)}</td>
                  <td>{c.clicks ?? 0}</td>
                  <td>{c.dailyBudget != null ? `${formatCurrency(c.dailyBudget)}/day` : '-'}</td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No campaigns for this account yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Performance Trend</h2>
        </div>
        <div className="panel-card">
          <PerformanceChart
            data={performance}
            xKey="date"
            lines={[
              { key: 'spend', name: 'Spend', color: '#4f46e5' },
              { key: 'clicks', name: 'Clicks', color: '#0d9488' },
            ]}
          />
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Reports</h2>
          <span className="section-count">{reports.length}</span>
        </div>
        <ReportTable reports={reports} />
      </section>
    </div>
  );
}
