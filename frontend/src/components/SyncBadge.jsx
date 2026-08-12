/**
 * Whether a keyword or ad copy actually reached Google Ads.
 *
 * The three not-synced states mean different things and must not read alike:
 * 'pending' was never attempted (it predates pushing on save), 'failed' was
 * attempted and rejected, and 'local-only' cannot be attempted because the
 * campaign or account isn't linked. Showing all of them as one label made a
 * record that was simply never sent look like a rejection.
 */
const STATES = {
  synced: { label: 'In Google Ads', pill: 'pill-success', hint: 'Live in Google Ads' },
  pending: { label: 'Not pushed yet', pill: 'pill-warning', hint: 'Created before pushing was automatic — use “Push to Google Ads”' },
  failed: { label: 'Push failed', pill: 'pill-error', hint: 'Google Ads rejected it' },
  'local-only': { label: 'Local only', pill: 'pill-neutral', hint: 'Cannot be pushed yet' },
};

export default function SyncBadge({ state, error, compact = false }) {
  const s = STATES[state] || STATES.pending;
  return (
    <span className={`pill ${s.pill}`} title={error || s.hint}>
      {compact && state === 'synced' ? 'Synced' : s.label}
    </span>
  );
}
