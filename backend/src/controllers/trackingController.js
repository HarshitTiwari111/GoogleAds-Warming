const asyncHandler = require('../middleware/asyncHandler');
const getClientIp = require('../utils/requestIp');
const landingClickService = require('../services/landingClickService');
const gclidService = require('../services/gclidService');
const logger = require('../utils/logger');

/**
 * Records a landing page visit and, if a gclid is present on the URL,
 * captures it into GclidLogs (deduplicated). Accepts params via query
 * string (GET - suits a tracking pixel/redirect) or JSON body (POST).
 *
 * Expected params: campaignId, campaignName, gclid, landingPageUrl
 */
const trackVisit = asyncHandler(async (req, res) => {
  const source = { ...req.query, ...req.body };
  const { campaignId, campaignName, gclid } = source;
  const landingPageUrl = source.landingPageUrl || source.url || req.headers.referer || '';

  if (!campaignId || !campaignName) {
    return res.status(400).json({
      success: false,
      message: 'campaignId and campaignName are required',
    });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  const visit = await landingClickService.recordVisit({
    campaignId,
    campaignName,
    gclid,
    ipAddress,
    userAgent,
    landingPageUrl,
  });

  let gclidResult = { isNew: false, doc: null };
  if (gclid) {
    gclidResult = await gclidService.recordGclid({
      gclid,
      campaignId,
      campaignName,
      landingPageUrl,
      ipAddress,
    });
  }

  logger.info(
    `Landing visit recorded for campaign ${campaignId} (gclid=${gclid || 'none'}, new=${gclidResult.isNew})`
  );

  res.status(201).json({
    success: true,
    data: {
      visit,
      gclid: gclidResult.doc,
      gclidIsNew: gclidResult.isNew,
    },
  });
});

module.exports = { trackVisit };
