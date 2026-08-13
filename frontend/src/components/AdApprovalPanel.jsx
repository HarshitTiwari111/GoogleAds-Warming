import { RefreshCw } from 'lucide-react';
import ApprovalBadge from './ApprovalBadge';

/**
 * What a policy topic means and who can act on it.
 *
 * Google reports these as bare constants — an operator reading
 * "ONE_WEBSITE_PER_AD_GROUP" has no way to know whether it is something this
 * dashboard got wrong or something they must fix in the Google Ads account,
 * so each known topic says which.
 */
const POLICY_HELP = {
  ONE_WEBSITE_PER_AD_GROUP:
    'Every ad in one ad group must point to the same website. Ad copies are now split into an ad group per domain, but ads pushed before that fix stay disapproved — delete them here and push again to recreate them in the right ad group.',
  EU_POLITICAL_ADS:
    'Google requires each account to declare whether it runs political ads in the EU. Until that declaration is made the ads keep serving outside the EU but are limited inside it. Set it in Google Ads → Admin → Account settings → Political content.',
  DESTINATION_NOT_WORKING:
    'Google could not load the final URL. Check that the landing page opens without a redirect loop, login wall, or error.',
  DESTINATION_MISMATCH:
    'The display URL and the final URL point to different domains. They must match.',
  TRADEMARKS_IN_AD_TEXT:
    'The ad text uses a trademarked term. Either remove it or file a trademark authorisation with Google.',
};

/**
 * What Google itself says about this campaign's ads.
 *
 * Approval is Google's decision and this dashboard cannot hurry it — but an ad
 * that never leaves review usually has a reason Google already reports, and
 * the most common one is that the account has no approved billing, in which
 * case the ad will never serve however long the review runs.
 *
 * The status itself is fetched by the page (via useAdApprovalStatus) and passed
 * in, because the same data also drives the badge on each ad card.
 */
export default function AdApprovalPanel({ status }) {
  const { data, message, loading, checkedAt, awaitingVerdict, reload } = status;

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

  // The distinct policies blocking any ad, so the same explanation isn't
  // repeated once per ad that hit it.
  const topics = [...new Set(ads.flatMap((ad) => (ad.policyTopics || []).map((t) => t.topic)))]
    .filter((t) => POLICY_HELP[t]);

  return (
    <div className="panel-card approval-panel">
      <div className="panel-card-header">
        <div>
          <h3>Google Ads status</h3>
          <span className="subtitle">What Google reports for this campaign&apos;s ads</span>
        </div>
        <button className="btn-secondary" onClick={reload} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'set-spin' : undefined} /> Refresh
        </button>
      </div>

      {/* Says plainly whether the page is still watching, so a stale-looking
          status isn't mistaken for a stuck one. */}
      {checkedAt && (
        <p className="set-hint approval-checked">
          Last checked {checkedAt.toLocaleTimeString()}
          {awaitingVerdict ? ' · re-checking every minute while ads await a verdict' : ' · all ads have a verdict'}
        </p>
      )}

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
              {ads.map((ad) => (
                <tr key={ad.adId}>
                  <td>{ad.headlines[0] || `Ad ${ad.adId}`}</td>
                  <td><ApprovalBadge ad={ad} /></td>
                  <td className="cell-muted">{ad.status || '—'}</td>
                  <td className="cell-sub">
                    {ad.policyTopics.length ? ad.policyTopics.map((t) => t.topic).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {topics.length > 0 && (
        <dl className="approval-policies">
          {topics.map((t) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{POLICY_HELP[t]}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="set-hint approval-note">
        Review is Google&apos;s and typically takes minutes to a working day. This dashboard reports
        it; it cannot approve an ad.
      </p>
    </div>
  );
}
