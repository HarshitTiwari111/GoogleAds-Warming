import { useEffect, useState } from 'react';
import { Layers, X, Plus } from 'lucide-react';
import { settingsApi, appSettingsApi, unwrap } from '../services/api';

const CURRENCIES = ['USD', 'AED', 'INR', 'EUR', 'GBP', 'SAR', 'QAR', 'AUD', 'CAD', 'SGD'];

const TIMEZONES = [
  { value: 'Asia/Dubai', label: '(GMT+04:00) United Arab Emirates' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) India' },
  { value: 'Asia/Riyadh', label: '(GMT+03:00) Saudi Arabia' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) Singapore' },
  { value: 'America/New_York', label: '(GMT-05:00) Eastern US' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific US' },
  { value: 'Europe/London', label: '(GMT+00:00) London' },
  { value: 'Australia/Sydney', label: '(GMT+11:00) Sydney' },
];

const ACCESS_ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'READ_ONLY', label: 'Read Only' },
  { value: 'EMAIL_ONLY', label: 'Email Only' },
];

const emptyForm = {
  accountName: '',
  inviteEmail: '',
  accessRole: 'ADMIN',
  currency: 'USD',
  timeZone: 'Asia/Dubai',
  country: 'India',
  mccId: '',
  // Per-campaign daily spend for the warm-up campaigns.
  campaignBudget: '',
  // Account-level spending cap pushed to Google Ads billing.
  billingBudget: '',
  campaignsPerAccount: 1,
  count: 1,
};

/**
 * Create or edit an account.
 *
 * Creating provisions the Google Ads client account under the chosen MCC,
 * spins up its warm-up campaigns at the campaign budget entered here, applies
 * the account spending limit, and sends the access invitation to the invite
 * email. A count above 1 turns the name into a prefix and runs in bulk.
 */
export default function AccountForm({ account, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [mccIds, setMccIds] = useState([]);
  const isEditing = Boolean(account);

  // MCC list from Settings; falls back to whatever manager accounts the
  // connected Google login can actually reach, so the picker is never empty
  // when a real choice exists.
  useEffect(() => {
    if (isEditing) return undefined;
    let cancelled = false;

    settingsApi
      .getMccIds()
      .then(async (res) => {
        const saved = (unwrap(res) || {}).mccIds || [];
        if (saved.length) return saved;
        const discovered = await settingsApi.discoverMccIds().catch(() => null);
        return (unwrap(discovered) || {}).mccIds || [];
      })
      .then((ids) => {
        if (cancelled) return;
        setMccIds(ids);
        // A single MCC is not a choice — preselect it so provisioning is explicit.
        if (ids.length === 1) setForm((f) => ({ ...f, mccId: f.mccId || ids[0] }));
      })
      .catch(() => !cancelled && setMccIds([]));

    return () => { cancelled = true; };
  }, [isEditing]);

  // Pre-fill budgets from the workspace defaults so the form opens on a sane
  // number the operator then adjusts.
  useEffect(() => {
    if (isEditing) return;
    Promise.all([
      appSettingsApi.get('default_daily_budget').catch(() => null),
      appSettingsApi.get('default_billing_budget').catch(() => null),
    ]).then(([daily, billing]) => {
      const d = unwrap(daily)?.value;
      const b = unwrap(billing)?.value;
      setForm((f) => ({
        ...f,
        campaignBudget: f.campaignBudget || (d ?? ''),
        billingBudget: f.billingBudget || (b ?? ''),
      }));
    });
  }, [isEditing]);

  useEffect(() => {
    if (account) {
      setForm({
        ...emptyForm,
        accountName: account.accountName || '',
        inviteEmail: account.inviteEmail || '',
        currency: account.currency || 'USD',
        timeZone: account.timeZone || 'Asia/Dubai',
        country: account.country || 'India',
        billingBudget: account.billingBudget ?? '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [account]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const step = (field, delta, min, max) => () =>
    setForm((f) => ({ ...f, [field]: Math.min(max, Math.max(min, Number(f[field]) + delta)) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} account`);
    }
  };

  const bulk = !isEditing && Number(form.count) > 1;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card af-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onCancel} aria-label="Close">
          <X size={16} />
        </button>

        <div className="af-head">
          <div className="af-head-icon">
            <Layers size={20} />
          </div>
          <div>
            <h3>{isEditing ? 'Edit Account' : 'Create Accounts'}</h3>
            <p>{isEditing ? 'Update this account’s details' : 'Auto-create under your MCC with predefined settings'}</p>
          </div>
        </div>

        <div className="af-divider" />

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          {!isEditing && (
            <div className="af-row">
              <div className="af-stat">
                <div className="af-stat-text">
                  <span className="af-stat-title">Accounts</span>
                  <span className="af-stat-sub">Max 50 per batch</span>
                </div>
                <div className="af-stepper">
                  <button type="button" onClick={step('count', -1, 1, 50)}>&minus;</button>
                  <input type="number" min="1" max="50" value={form.count} onChange={handleChange('count')} required />
                  <button type="button" onClick={step('count', 1, 1, 50)}>+</button>
                </div>
              </div>

              <div className="af-stat">
                <div className="af-stat-text">
                  <span className="af-stat-title">Campaigns / Account</span>
                  <span className="af-stat-sub">{form.campaignBudget || 0}/day each</span>
                </div>
                <div className="af-stepper">
                  <button type="button" onClick={step('campaignsPerAccount', -1, 1, 10)}>&minus;</button>
                  <input type="number" min="1" max="10" value={form.campaignsPerAccount} onChange={handleChange('campaignsPerAccount')} required />
                  <button type="button" onClick={step('campaignsPerAccount', 1, 1, 10)}>+</button>
                </div>
              </div>
            </div>
          )}

          <div className="af-row">
            <label className="field">
              <span>{bulk ? 'Account Name Prefix' : 'Account Name'} *</span>
              <input
                type="text"
                value={form.accountName}
                onChange={handleChange('accountName')}
                placeholder={bulk ? 'Account' : 'e.g. Client XYZ Google Ads'}
                required
              />
            </label>
            <label className="field">
              <span>Currency</span>
              <select value={form.currency} onChange={handleChange('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="af-row">
            <label className="field">
              <span>Time Zone</span>
              <select value={form.timeZone} onChange={handleChange('timeZone')}>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Invite Email <em className="field-note">(optional)</em></span>
              <input
                type="email"
                value={form.inviteEmail}
                onChange={handleChange('inviteEmail')}
                placeholder="user@example.com"
              />
            </label>
          </div>

          {/* The only two budgets: the account's billing cap, and what each
              campaign runs at. Both operator-set, never generated. */}
          <div className="af-row">
            <label className="field">
              <span>Billing Budget {!isEditing && '*'}</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.billingBudget}
                onChange={handleChange('billingBudget')}
                placeholder="Account spending limit"
                required={!isEditing}
              />
            </label>
            <label className="field">
              <span>Campaign Budget {!isEditing && '*'}</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.campaignBudget}
                onChange={handleChange('campaignBudget')}
                placeholder="Per campaign, per day"
                required={!isEditing}
              />
            </label>
          </div>

          {!isEditing && (
            <div className="af-row">
              {/* The account is created under exactly the MCC picked here. */}
              <label className="field">
                <span>Select MCC {mccIds.length === 0 && <em className="field-note">— none saved</em>}</span>
                <select value={form.mccId} onChange={handleChange('mccId')}>
                  <option value="">{mccIds.length ? 'Automatic — try each in order' : 'Automatic'}</option>
                  {mccIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>

              {form.inviteEmail && (
                <label className="field">
                  <span>Access Role</span>
                  <select value={form.accessRole} onChange={handleChange('accessRole')}>
                    {ACCESS_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {!isEditing && (
            <div className="af-preview">
              <span className="af-preview-icon">
                <Plus size={14} />
              </span>
              <span>
                <strong>{form.count}</strong> account{Number(form.count) > 1 ? 's' : ''} &middot;{' '}
                <strong>{form.campaignsPerAccount}</strong> campaign{Number(form.campaignsPerAccount) > 1 ? 's' : ''} each at{' '}
                <strong>{form.campaignBudget || 0}</strong>/day &middot;{' '}
                <strong>
                  {form.accountName || 'Account'}{bulk ? ` 1 – ${form.count}` : ''}
                </strong>
                {form.billingBudget && <span className="af-preview-dim"> &middot; limit {form.billingBudget}</span>}
                <span className="af-preview-dim"> &middot; MCC {form.mccId || 'auto'}</span>
                {form.inviteEmail && <span className="af-preview-dim"> &middot; {form.inviteEmail}</span>}
              </span>
            </div>
          )}

          <div className="af-divider af-divider-bottom" />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="refresh-btn af-submit" disabled={submitting}>
              {submitting
                ? 'Saving…'
                : isEditing
                  ? 'Save Changes'
                  : `Create ${bulk ? `${form.count} Accounts` : 'Account'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
