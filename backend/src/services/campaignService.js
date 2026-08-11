const Campaign = require('../models/Campaign');
const googleAdsService = require('./googleAdsService');
const campaignTemplates = require('../config/campaignTemplates');
const logger = require('../utils/logger');

const campaignService = {
  /**
   * Creates the initial "warm-up" campaign for a freshly-provisioned Account
   * and starts it. Sequence: createCampaignBudget -> createCampaign ->
   * createAdGroup -> enableCampaign -> local Campaign doc reflecting the
   * result.
   *
   * The daily budget comes from the account the operator just configured,
   * falling back to the template only when the account has none. Nothing here
   * is randomised.
   */
  async createWarmupCampaign(account, credentials = {}) {
    const template = campaignTemplates.warmup;

    const dailyBudget =
      Number(account.dailyBudget) > 0
        ? Number(account.dailyBudget)
        : template.budgetAmountMicros / 1_000_000;
    const budgetAmountMicros = Math.round(dailyBudget * 1_000_000);

    // Every Google Ads call for a client account must carry the MCC it was
    // created under as login-customer-id.
    const loginCustomerId = account.sourceMccId || null;

    try {
      // Broad-match keyword seed derived from the account/client being warmed
      // up, since a search campaign with zero keywords has nothing to match
      // against and never serves - can be edited later via the Campaign doc.
      const keywordSeed = [account.accountName, account.clientName].filter(Boolean);

      const campaign = await Campaign.create({
        account: account._id,
        campaignName: `${template.name} - ${account.accountName}`,
        campaignType: 'warmup',
        dailyBudget,
        biddingStrategy: template.biddingStrategy,
        targetLocations: template.geoTargets,
        keywords: keywordSeed,
        adGroupName: template.adGroup.name,
        adHeadlines: template.defaultHeadlines || [],
        adDescriptions: template.defaultDescriptions || [],
        country: [account.country || 'India'],
        sourceMccId: loginCustomerId,
        status: 'pending',
        startDate: new Date(),
        // Mirror the account's ownership so per-user scoped queries see it.
        owner: account.owner || account.createdBy || null,
        createdBy: account.createdBy || null,
      });

      if (account.googleAdsCustomerId) {
        try {
          const budgetResource = await googleAdsService.createCampaignBudget(
            account.googleAdsCustomerId,
            budgetAmountMicros,
            credentials,
            loginCustomerId
          );

          const campaignResource = await googleAdsService.createCampaign(
            account.googleAdsCustomerId,
            template,
            budgetResource,
            credentials,
            loginCustomerId
          );

          await googleAdsService.createCampaignCriteria(
            account.googleAdsCustomerId,
            campaignResource,
            template.geoTargets,
            credentials,
            loginCustomerId
          );

          const adGroupResource = await googleAdsService.createAdGroup(
            account.googleAdsCustomerId,
            campaignResource,
            template.adGroup,
            credentials,
            loginCustomerId
          );

          await googleAdsService.createKeywords(
            account.googleAdsCustomerId,
            adGroupResource,
            keywordSeed,
            credentials,
            loginCustomerId
          );

          if (account.website) {
            await googleAdsService.createResponsiveSearchAd(
              account.googleAdsCustomerId,
              adGroupResource,
              {
                finalUrl: account.website,
                headlines: template.defaultHeadlines,
                descriptions: template.defaultDescriptions,
              },
              credentials,
              loginCustomerId
            );
          } else {
            logger.warn(`Account ${account.accountName} has no website set - warm-up campaign created with no ad (nothing to link clicks to).`);
          }

          await googleAdsService.enableCampaign(
            account.googleAdsCustomerId,
            campaignResource,
            credentials,
            loginCustomerId
          );

          campaign.googleCampaignId = campaignResource.split('/').pop();
          campaign.status = 'active';
          await campaign.save();
        } catch (apiError) {
          campaign.status = 'failed';
          await campaign.save();
          throw apiError;
        }
      }

      return campaign;
    } catch (error) {
      console.error('Error creating warmup campaign:', error.message);
      throw error;
    }
  },
};

module.exports = campaignService;
