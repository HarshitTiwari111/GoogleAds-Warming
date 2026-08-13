import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { campaignsApi, unwrap } from '../services/api';

// Google's approval vocabulary, translated to what it means for the operator.
const APPROVAL = {
  APPROVED: { label: 'Approved', pill: 'pill-success', icon: <CheckCircle2 size={13} /> },
  APPROVED_LIMITED: { label: 'Approved (limited)', pill: 'pill-warning', icon: <AlertTriangle size={13} /> },
  AREA_OF_INTEREST_ONLY: { label: 'Limited reach', pill: 'pill-warning', icon: <AlertTriangle size={13} /> },
  DISAPPROVED: { label: 'Disapproved', pill: 'pill-error', icon: <AlertTriangle size={13} /> },
  UNKNOWN: { label: 'Under review', pill: 'pill-neutral', icon: <Clock size={13} /> },
};

/**
 * What Google itself says about this campaign's ads.
 *
 * Approval is Google's decision and this dashboard cannot hurry it — but an ad
 * that never leaves review usually has a reason Google already reports, and
 * the most common one is that the account has no approved billing, in which
 * case the ad will never serve however long the review runs.
 */
export default function AdApprovalPanel({ campaignId }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return campaignsApi
      .adStatus(campaignId)
      .then((res) => {
        setData(unwrap(res));
        setMessage(res.success ? null : res.message);
      })
      .catch((err) => setMessage(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing useful to say yet — stay out of the way rather than show an empty box.
  if (loading && !data) return null;
  if (message) {
    return (
      <div className="panel-card approval-panel">
        <p className="set-hint">{message}</p>
      </div>
    );
  }
  if (!data) return null;

  const { ads = [], billing, adsError } = data;
  const billingMissing = billing && !billing.hasApprovedBilling;

  return (
    <div className="panel-card approval-panel">
      <div className="panel-card-header">
        <div>
          <h3>Google Ads status</h3>
          <span className="subtitle">What Google reports for this campaign&apos;s ads</span>
        </div>
        <button className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'set-spin' : undefined} /> Refresh
        </button>
      </div>

      {/* The single most common reason ads never leave review. */}
      {billingMissing && (
        <div className="error-banner approval-billing">
          <strong>No approved billing on this account.</strong> Google holds ads under review and
          won&apos;t serve them until billing is set up. Add a payment method in Google Ads →
          Billing → Settings for this customer id.
        </div>
      )}

      {adsError ? (
        <p className="set-hint overflow-note">{adsError}</p>
      ) : ads.length === 0 ? (
        <p className="set-hint">Google reports no ads on this campaign yet.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Google status</th>
                <th>Serving</th>
                <th>Policy</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => {
                const a = APPROVAL[ad.approvalStatus] || APPROVAL.UNKNOWN;
                return (
                  <tr key={ad.adId}>
                    <td>{ad.headlines[0] || `Ad ${ad.adId}`}</td>
                    <td>
                      <span className={`pill ${a.pill}`}>{a.icon} {a.label}</span>
                    </td>
                    <td className="cell-muted">{ad.status || '—'}</td>
                    <td className="cell-sub">
                      {ad.policyTopics.length
                        ? ad.policyTopics.map((t) => t.topic).join(', ')
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="set-hint approval-note">
        Review is Google&apos;s and typically takes minutes to a working day. This dashboard reports
        it; it cannot approve an ad.
      </p>
    </div>
  );
}
