/**
 * Campaign Monitoring landing page tracking snippet.
 *
 * Add this to your landing page, right before </body>:
 *   <script src="https://YOUR_BACKEND_DOMAIN/tracking.js"></script>
 *
 * It reads campaign/gclid info from the page's own URL (put there by Google
 * Ads via a tracking template - see README) and pings the monitoring API.
 * Self-contained: no dependencies, fails silently if params are missing so
 * it never breaks the page it's installed on.
 */
(function () {
  try {
    var scriptEl = document.currentScript;
    if (!scriptEl) return;

    var apiOrigin = new URL(scriptEl.src).origin;
    var params = new URLSearchParams(window.location.search);

    var campaignId = params.get('campaignid') || params.get('campaign_id') || params.get('cid');
    if (!campaignId) return; // nothing to attribute this visit to

    var campaignName = params.get('campaignname') || params.get('campaign_name') || document.title || campaignId;
    var gclid = params.get('gclid') || '';

    var query = new URLSearchParams({
      campaignId: campaignId,
      campaignName: campaignName,
      gclid: gclid,
      landingPageUrl: window.location.href,
    });

    fetch(apiOrigin + '/api/tracking/visit?' + query.toString(), { mode: 'cors' }).catch(function () {});
  } catch (e) {
    // Never let tracking errors affect the host page.
  }
})();
