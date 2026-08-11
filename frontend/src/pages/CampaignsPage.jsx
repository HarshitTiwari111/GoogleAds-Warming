import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Megaphone, Key, Trash2, Layers, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import BulkContentModal from '../components/BulkContentModal';
import { campaignsApi, accountsApi, unwrap } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'ended', label: 'Ended' },
  { value: 'failed', label: 'Failed' },
];

const DEVICE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
];

function statusPill(status) {
  if (status === 'active' || status === 'published') return 'pill-success';
  if (status === 'failed') return 'pill-error';
  if (status === 'paused' || status === 'draft') return 'pill-warning';
  return 'pill-neutral';
}

/**
 * Campaigns table, in the shape the Warming-Farming project used: the
 * performance columns inline, and per-row buttons into this campaign's ad
 * copies and keywords.
 */
export default function CampaignsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulk, setShowBulk] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return campaignsApi
      .list()
      .then((res) => {
        setCampaigns(unwrap(res) || []);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = () => {
    setSyncing(true);
    accountsApi
      .syncGoogleAds()
      .then(() => showToast('Sync started — refresh in a minute or two.'))
      .catch((err) => showToast(err.response?.data?.message || 'Sync failed', 'error'))
      .finally(() => setSyncing(false));
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await campaignsApi.remove(pendingDelete._id);
      showToast('Campaign deleted');
      // Drop it from the selection too, or the count would include a row that
      // no longer exists.
      setSelectedIds((ids) => ids.filter((id) => id !== pendingDelete._id));
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete campaign', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const selectedCampaigns = campaigns.filter((c) => selectedIds.includes(c._id));

  const handleBulkApply = async ({ keywords, ads }) => {
    setApplying(true);
    try {
      const res = await campaignsApi.bulkAddContent(selectedIds, { keywords, ads });
      const d = res.data || {};
      showToast(res.message || 'Applied to the selected campaigns');

      // Partial failures are reported rather than swallowed — the write still
      // went through for everything else.
      if (d.errors?.length) {
        showToast(`${d.errors.length} item(s) failed: ${d.errors[0]}`, 'error');
      }
      if (d.skipped) {
        showToast(`${d.skipped} campaign(s) skipped — not accessible to you`, 'error');
      }

      setShowBulk(false);
      setSelectedIds([]);
    } finally {
      setApplying(false);
    }
  };

  const columns = [
    {
      key: 'campaignName',
      label: 'Campaign Name',
      sortable: true,
      filterable: true,
      render: (row) => <span style={{ fontWeight: 600 }}>{row.campaignName}</span>,
    },
    {
      key: 'googleCampaignId',
      label: 'Google Ads ID',
      sortable: true,
      render: (row) =>
        row.googleCampaignId ? <span className="acct-id">{row.googleCampaignId}</span> : <span className="cell-muted">-</span>,
    },
    {
      key: 'status',
      label: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: STATUS_OPTIONS,
      render: (row) => <span className={`pill ${statusPill(row.status)}`}>{row.status}</span>,
    },
    { key: 'clicks', label: 'Clicks', sortable: true, render: (row) => row.clicks ?? 0 },
    { key: 'impressions', label: 'Impressions', sortable: true, render: (row) => row.impressions ?? 0 },
    { key: 'ctr', label: 'CTR', sortable: true, render: (row) => `${(row.ctr ?? 0).toFixed(1)}%` },
    { key: 'spend', label: 'Spend', sortable: true, render: (row) => `$${(row.spend ?? 0).toFixed(2)}` },
    { key: 'cpc', label: 'CPC', sortable: true, render: (row) => `$${(row.cpc ?? 0).toFixed(2)}` },
    { key: 'conversions', label: 'Conversions', sortable: true, render: (row) => row.conversions ?? 0 },
    {
      key: 'device',
      label: 'Device',
      filterable: true,
      filterType: 'select',
      filterOptions: DEVICE_OPTIONS,
      // device/country are arrays on the model; show them comma-joined.
      render: (row) => (row.device?.length ? row.device.join(', ') : 'all'),
    },
    {
      key: 'country',
      label: 'Country',
      sortable: true,
      render: (row) => (row.country?.length ? row.country.join(', ') : '-'),
    },
    { key: 'dailyBudget', label: 'Daily Budget', sortable: true, render: (row) => `$${row.dailyBudget ?? 0}` },
    {
      key: 'ads',
      label: 'Ad Copy',
      render: (row) => (
        <button className="camp-cell-btn camp-cell-btn-ads" onClick={() => navigate(`/campaigns/${row._id}/ads`)}>
          <Megaphone size={13} /> Ads
        </button>
      ),
    },
    {
      key: 'keywords',
      label: 'Keywords',
      render: (row) => (
        <button className="camp-cell-btn camp-cell-btn-keyword" onClick={() => navigate(`/campaigns/${row._id}/keywords`)}>
          <Key size={13} /> Keywords
        </button>
      ),
    },
    ...(isAdmin
      ? [{
          key: 'sourceMccId',
          label: 'MCC ID',
          render: (row) =>
            row.sourceMccId ? <span className="set-mcc-chip">{row.sourceMccId}</span> : <span className="cell-muted">-</span>,
        }]
      : []),
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <button
          className="camp-action-btn camp-action-delete"
          onClick={() => setPendingDelete(row)}
          aria-label={`Delete ${row.campaignName}`}
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Campaigns" subtitle="Manage Google Ads campaigns" />

      {error && <div className="error-banner">{error}</div>}

      {/* Appears only once something is selected, so it never takes up space
          during ordinary browsing. */}
      {selectedIds.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">
            {selectedIds.length} campaign{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <button className="btn-primary" onClick={() => setShowBulk(true)}>
            <Layers size={15} /> Add Keywords &amp; Ad Copies
          </button>
          <button className="btn-secondary" onClick={() => setSelectedIds([])}>
            <X size={15} /> Clear
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={campaigns}
        loading={loading}
        emptyMessage="No campaigns found."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        actions={
          <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'set-spin' : undefined} />
            {syncing ? 'Syncing…' : 'Sync Ads'}
          </button>
        }
      />

      {showBulk && (
        <BulkContentModal
          campaigns={selectedCampaigns}
          onSubmit={handleBulkApply}
          onCancel={() => setShowBulk(false)}
          submitting={applying}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete campaign"
          message={`Delete "${pendingDelete.campaignName}"? This removes the local record only.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
