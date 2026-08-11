/**
 * Campaign templates used by services/campaignService.js when provisioning
 * new Google Ads campaigns. The `warmup` template's exact defaults come from
 * the account-provisioning source project and must be preserved:
 *   - $1/day budget (1,000,000 micros)
 *   - MAXIMIZE_CLICKS bidding
 *   - India geo-target (2356)
 *   - $0.50 max CPC cap on the ad group
 */
const campaignTemplates = {
  warmup: {
    name: 'Warm-up Campaign',
    budgetAmountMicros: 1000000, // $1/day in micros
    biddingStrategy: 'MAXIMIZE_CLICKS',
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
    },
    geoTargets: ['2356'], // India - change as needed
    adGroup: {
      name: 'Warm-up Ad Group',
      cpcBidMicros: 500000, // $0.50 max CPC
    },
    // Minimal viable responsive search ad copy so the warm-up campaign is
    // actually eligible to serve in real (non-simulation) API mode - a
    // campaign/ad group with no ad and no keywords never gets an impression.
    // Placeholders reference the account/client name at creation time; edit
    // the resulting Campaign doc's adHeadlines/adDescriptions/keywords fields
    // for real ad copy once you have some.
    defaultHeadlines: ['Official Website', 'Shop Now & Save', 'Explore Our Offers'],
    defaultDescriptions: [
      'Quality products and services you can trust.',
      'Visit us today and discover more.',
    ],
  },
  standard: {
    name: 'Standard Campaign',
    budgetAmountMicros: 5000000, // $5/day
    biddingStrategy: 'TARGET_CPA',
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
    },
    geoTargets: ['2356'],
    adGroup: {
      name: 'Main Ad Group',
      cpcBidMicros: 1000000,
    },
  },
};

module.exports = campaignTemplates;
