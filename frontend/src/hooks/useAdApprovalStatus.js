import { useCallback, useEffect, useMemo, useState } from 'react';
import { campaignsApi, unwrap } from '../services/api';

const POLL_MS = 60000;

/**
 * Google's own verdict on a campaign's ads, kept fresh while any ad is still
 * awaiting one.
 *
 * Shared by the summary panel and the per-ad badges so both read from a single
 * fetch — asking twice would double the API calls and let the two views
 * disagree about the same ad.
 */
export default function useAdApprovalStatus(campaignId) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return campaignsApi
      .adStatus(campaignId)
      .then((res) => {
        setData(unwrap(res));
        setMessage(res.success ? null : res.message);
        setCheckedAt(new Date());
      })
      .catch((err) => setMessage(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // Google decides when an ad is approved; all this does is notice promptly.
  // Polling stops once nothing is awaiting a verdict, so a settled campaign
  // isn't queried forever.
  const awaitingVerdict = (data?.ads || []).some(
    (a) => a.approvalStatus === 'UNKNOWN' || a.reviewStatus === 'UNDER_REVIEW' || a.reviewStatus === 'REVIEW_IN_PROGRESS'
  );

  useEffect(() => {
    if (!awaitingVerdict) return undefined;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [awaitingVerdict, load]);

  /**
   * Google's ads keyed by ad id, so a local ad copy can find its own verdict.
   *
   * A stored resource name looks like `customers/123/adGroupAds/456~789`,
   * where the trailing segment after `~` is the ad id Google reports here.
   */
  const byAdId = useMemo(() => {
    const map = {};
    (data?.ads || []).forEach((ad) => { if (ad.adId) map[ad.adId] = ad; });
    return map;
  }, [data]);

  const lookup = useCallback(
    (googleResourceName) => {
      if (!googleResourceName) return null;
      const adId = String(googleResourceName).split('~').pop();
      return byAdId[adId] || null;
    },
    [byAdId]
  );

  return { data, message, loading, checkedAt, awaitingVerdict, reload: load, lookup };
}
