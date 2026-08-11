import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Mail, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import AccountForm from '../components/AccountForm';
import ConfirmModal from '../components/ConfirmModal';
import { accountsApi, unwrap } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const CURRENCY_OPTIONS = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'AUD', 'SGD', 'CAD'].map((c) => ({
  value: c,
  label: c,
}));

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'created', label: 'Created' },
  { value: 'warming', label: 'Warming' },
  { value: 'paused', label: 'Paused' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'failed', label: 'Failed' },
];

function statusPill(status) {
  if (status === 'active' || status === 'created') return 'pill-success';
  if (status === 'failed' || status === 'suspended') return 'pill-error';
  if (status === 'paused' || status === 'pending' || status === 'warming') return 'pill-warning';
  return 'pill-neutral';
}

/**
 * Accounts managed by this dashboard. Rows come from the local Account
 * records — that's where the billing budget, timezone and status the operator
 * set actually live. "Sync Ads" refreshes the Google Ads snapshot behind them.
 */
export default function AccountsPage() {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [inviteTarget, setInviteTarget] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);

  const loadAccounts = useCallback(() => {
    setLoading(true);
    return accountsApi
      .list()
      .then((res) => {
        setAccounts(unwrap(res) || []);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleSync = () => {
    setSyncing(true);
    accountsApi
      .syncGoogleAds()
      .then(() => showToast('Sync started — refresh in a minute or two.'))
      .catch((err) => showToast(err.response?.data?.message || 'Sync failed', 'error'))
      .finally(() => setSyncing(false));
  };

  /**
   * One modal covers both single and bulk creation: a count above 1 goes to
   * the bulk endpoint, which provisions in the background.
   */
  const handleSubmit = async (form) => {
    setSubmitting(true);
    try {
      if (editing) {
        await accountsApi.update(editing._id, {
          accountName: form.accountName,
          inviteEmail: form.inviteEmail,
          currency: form.currency,
          timeZone: form.timeZone,
          country: form.country,
          billingBudget: form.billingBudget === '' ? undefined : Number(form.billingBudget),
        });
        showToast('Account updated');
      } else {
        const campaignBudget = Number(form.campaignBudget) || 1;
        const shared = {
          currencyCode: form.currency,
          timeZone: form.timeZone,
          country: form.country,
          campaignsPerAccount: Number(form.campaignsPerAccount) || 1,
          // Each warm-up campaign runs at this; the account's own daily budget
          // follows it, so there is only one number to reason about.
          campaignBudget,
          dailyBudget: campaignBudget,
          ...(form.billingBudget !== '' && { billingBudget: Number(form.billingBudget) }),
          ...(form.mccId && { mccId: form.mccId }),
          // Access role only travels with an invite, and uses whatever the
          // operator picked rather than being forced to ADMIN.
          ...(form.inviteEmail && {
            emailAddress: form.inviteEmail,
            accessRole: form.accessRole || 'ADMIN',
          }),
        };

        const count = Number(form.count) || 1;
        if (count > 1) {
          const res = await accountsApi.bulkCreateGoogleAdsAccounts({ ...shared, count, prefix: form.accountName });
          showToast(res.message || `Creating ${count} accounts in the background…`);
        } else {
          const res = await accountsApi.createGoogleAdsAccount({ ...shared, accountName: form.accountName });
          showToast(res.message || 'Account created');
        }
      }

      setShowForm(false);
      setEditing(null);
      loadAccounts();
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteTarget) return;
    setInviting(true);
    try {
      const res = await accountsApi.inviteAccount(inviteTarget._id, inviteEmail || undefined);
      showToast(res.message || 'Invitation sent');
      setInviteTarget(null);
      loadAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send invite', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await accountsApi.remove(pendingDelete._id);
      showToast('Account deleted');
      loadAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete account', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const columns = [
    {
      key: 'accountName',
      label: 'Name',
      sortable: true,
      filterable: true,
      render: (row) => <span style={{ fontWeight: 600 }}>{row.accountName}</span>,
    },
    {
      key: 'googleAdsCustomerId',
      label: 'Google Ads ID',
      sortable: true,
      render: (row) =>
        row.googleAdsCustomerId ? (
          <span className="acct-id">{row.googleAdsCustomerId}</span>
        ) : (
          <span className="cell-muted">-</span>
        ),
    },
    {
      key: 'currency',
      label: 'Currency',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: CURRENCY_OPTIONS,
    },
    {
      key: 'billingBudget',
      label: 'Billing Budget',
      sortable: true,
      render: (row) => `$${row.billingBudget ?? 0}`,
    },
    { key: 'timeZone', label: 'Timezone', sortable: true },
    {
      key: 'status',
      label: 'Status',
      filterable: true,
      filterType: 'select',
      filterOptions: STATUS_OPTIONS,
      render: (row) => <span className={`pill ${statusPill(row.status)}`}>{row.status}</span>,
    },
    // Which MCC the account was provisioned under only matters to an admin
    // reviewing across users.
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
        <div className="cell-actions">
          <button
            className="camp-action-btn"
            onClick={() => { setInviteTarget(row); setInviteEmail(row.inviteEmail || ''); }}
            title="Send Google Ads access invitation"
            aria-label={`Invite for ${row.accountName}`}
          >
            <Mail size={15} />
          </button>
          <button
            className="camp-action-btn camp-action-edit"
            onClick={() => { setEditing(row); setShowForm(true); }}
            aria-label={`Edit ${row.accountName}`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="camp-action-btn camp-action-delete"
            onClick={() => setPendingDelete(row)}
            aria-label={`Delete ${row.accountName}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Accounts" subtitle="Manage Google Ads accounts" />

      {error && <div className="error-banner">{error}</div>}

      <DataTable
        columns={columns}
        data={accounts}
        loading={loading}
        emptyMessage="No accounts yet. Click Add Accounts to create one."
        actions={
          <>
            <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? 'set-spin' : undefined} />
              {syncing ? 'Syncing…' : 'Sync Ads'}
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus size={15} /> Add Accounts
            </button>
          </>
        }
      />

      {showForm && (
        <AccountForm
          account={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          submitting={submitting}
        />
      )}

      {inviteTarget && (
        <div className="modal-overlay" onClick={() => setInviteTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Send Invite</h3>
            <p>
              Google emails an ADMIN access invitation for <strong>{inviteTarget.accountName}</strong>.
            </p>

            <form onSubmit={handleInvite}>
              <label className="field">
                <span>Email Address</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@gmail.com"
                  autoFocus
                  required
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={() => setInviteTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="refresh-btn" disabled={inviting}>
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete account"
          message={`Delete "${pendingDelete.accountName}"? This removes the local record only — the Google Ads account itself is not touched.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
