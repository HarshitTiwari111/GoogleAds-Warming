import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

/**
 * Google's approval vocabulary, translated to what it means for the operator.
 *
 * This is a different question from SyncBadge's: SyncBadge says whether the
 * push from this dashboard reached Google, this says what Google then decided
 * about the ad. An ad can be pushed successfully and still be disapproved.
 */
export const APPROVAL = {
  APPROVED: { label: 'Approved', pill: 'pill-success', icon: CheckCircle2, hint: 'Google approved this ad — it can serve' },
  APPROVED_LIMITED: { label: 'Approved (limited)', pill: 'pill-warning', icon: AlertTriangle, hint: 'Approved, but Google limits where it shows' },
  AREA_OF_INTEREST_ONLY: { label: 'Limited reach', pill: 'pill-warning', icon: AlertTriangle, hint: 'Shows only to people searching for this area' },
  DISAPPROVED: { label: 'Disapproved', pill: 'pill-error', icon: AlertTriangle, hint: 'Google rejected this ad — see the policy column' },
  UNKNOWN: { label: 'Under review', pill: 'pill-neutral', icon: Clock, hint: 'Google is still reviewing this ad' },
};

export default function ApprovalBadge({ ad }) {
  // No entry means Google has no record of this ad — that is what SyncBadge
  // reports, so staying silent here avoids two badges saying the same thing.
  if (!ad) return null;

  const a = APPROVAL[ad.approvalStatus] || APPROVAL.UNKNOWN;
  const Icon = a.icon;
  const topics = (ad.policyTopics || []).map((t) => t.topic).filter(Boolean);

  return (
    <span className={`pill ${a.pill}`} title={topics.length ? `${a.hint} — ${topics.join(', ')}` : a.hint}>
      <Icon size={13} /> {a.label}
    </span>
  );
}
