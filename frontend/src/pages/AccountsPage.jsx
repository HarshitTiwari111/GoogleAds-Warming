import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Mail, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import AccountForm from '../components/AccountForm';
import ConfirmModal from '../components/ConfirmModal';
import { accountsApi, unwrap } from '../services/api';
import { newestCreatedFirst } from '../utils/sortRows';
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

  /**
   * Accounts come from two places and both matter:
   *  - the synced Google Ads snapshot, which is everything under the linked
   *    MCC(s) — the bulk of the list, and the reason this page exists,
   *  - the local Account records, which carry the operator-set billing budget,
   *    timezone, status and invite email that Google doesn't store for us.
   *
   * They are merged on the Google Ads customer id so an account provisioned
   * here appears once, with its local settings, rather than twice.
   */
  const loadAccounts = useCallback(() => {
    setLoading(true);
    return Promise.all([
      accountsApi.googleAds().catch(() => ({ data: [] })),
      accountsApi.list().catch(() => []),
    ])
      .then(([syncedRes, localRes]) => {
        const synced = (unwrap(syncedRes) || []).filter((a) => !a.isManager);
        const local = unwrap(localRes) || [];

        const localByCustomerId = new Map(
          local.filter((a) => a.googleAdsCustomerId).map((a) => [String(a.googleAdsCustomerId), a])
        );

        const merged = synced.map((s) => {
          const match = localByCustomerId.get(String(s.customerId));
          if (match) {
            localByCustomerId.delete(String(s.customerId));
            return { ...match, sourceMccId: match.sourceMccId || s.managerAccountId };
          }
          // Synced-only: no local record, so the operator-set fields are blank.
          return {
            _id: `synced-${s.customerId}`,
            accountName: s.name || `Account ${s.customerId}`,
            googleAdsCustomerId: s.customerId,
            sourceMccId: s.managerAccountId || null,
            currency: s.currency || '—',
            timeZone: s.timeZone || '—',
            billingBudget: null,
            status: 'active',
            syncedOnly: true,
          };
        });

        // Local records with no Google Ads id yet (drafts, failed provisions).
        const localOnly = local.filter((a) => !a.googleAdsCustomerId || localByCustomerId.has(String(a.googleAdsCustomerId)));

        setAccounts(newestCreatedFirst([...merged, ...localOnly]));
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
          // The account can be created while the invite is rejected — that is
          // a partial success, not a success, so it must not look green.
          showToast(res.message || 'Account created', res.inviteFailed ? 'error' : 'success');
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
      filterPlaceholder: 'Search name or customer ID...',
      // One box searches both, since an operator has the customer id to hand
      // as often as the name.
      filterValue: (row) => [row.accountName, row.googleAdsCustomerId],
      render: (row) => <span style={{ fontWeight: 600 }}>{row.accountName}</span>,
    },
    {
      key: 'googleAdsCustomerId',
      // "Customer ID" is what Google calls this. Labelling it "Google Ads ID"
      // on both pages made it look like it should equal a campaign's id.
      label: 'Customer ID',
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
      // Blank for accounts that exist only in Google Ads — the billing budget
      // is a local setting, so showing $0 would misreport them as capped.
      render: (row) => (row.billingBudget == null ? <span className="cell-muted">—</span> : `$${row.billingBudget}`),
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
      // Edit and delete act on a local record. An account that exists only in
      // the synced snapshot has none, so those are disabled rather than
      // failing on a synthetic id. Inviting still works — it goes to Google
      // by customer id.
      render: (row) => (
        <div className="cell-actions">
          <button
            className="camp-action-btn"
            onClick={() => { setInviteTarget(row); setInviteEmail(row.inviteEmail || ''); }}
            disabled={row.syncedOnly}
            title={row.syncedOnly ? 'Create this account here to manage invites' : 'Send Google Ads access invitation'}
            aria-label={`Invite for ${row.accountName}`}
          >
            <Mail size={15} />
          </button>
          <button
            className="camp-action-btn camp-action-edit"
            onClick={() => { setEditing(row); setShowForm(true); }}
            disabled={row.syncedOnly}
            title={row.syncedOnly ? 'Only synced from Google Ads — nothing local to edit' : 'Edit'}
            aria-label={`Edit ${row.accountName}`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="camp-action-btn camp-action-delete"
            onClick={() => setPendingDelete(row)}
            disabled={row.syncedOnly}
            title={row.syncedOnly ? 'Only synced from Google Ads — nothing local to delete' : 'Delete'}
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
