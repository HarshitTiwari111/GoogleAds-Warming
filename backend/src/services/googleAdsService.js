const env = require('../config/env');
const logger = require('../utils/logger');
const CampaignMetrics = require('../models/CampaignMetrics');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

const WORKER_BASE = 'https://secure.dataram.workers.dev/api/v24';

const isSimulation = () => env.googleAds.simulationMode;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MOCK_CAMPAIGNS = [
  { campaignId: '1000000001', campaignName: 'CPS - Weight Loss - US' },
  { campaignId: '1000000002', campaignName: 'CPS - Skincare - UK' },
  { campaignId: '1000000003', campaignName: 'CPS - Finance Leads - CA' },
  { campaignId: '1000000004', campaignName: 'CPS - Insurance Quotes - AU' },
  { campaignId: '1000000005', campaignName: 'CPS - Crypto Signup - IN' },
];

function generateMockMetrics() {
  return MOCK_CAMPAIGNS.map(({ campaignId, campaignName }, index) => {
    const clicks = randomInt(5, 60);
    const impressions = clicks * randomInt(8, 20);
    const spend = parseFloat((clicks * (Math.random() * 1.5 + 0.3)).toFixed(2));
    const conversions = Math.random() < 0.4 ? 0 : randomInt(1, 5);
    const cpc = clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0;
    const status = index === MOCK_CAMPAIGNS.length - 1 && Math.random() < 0.3 ? 'PAUSED' : 'ENABLED';
    return { campaignId, campaignName, spend, clicks, impressions, conversions, cpc, status, timestamp: new Date() };
  });
}

function generateSimulatedPerformance(dateFrom, dateTo) {
  const data = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const impressions = Math.floor(80 + Math.random() * 150);
    const clicks = Math.floor(impressions * (0.02 + Math.random() * 0.06));
    const spend = +(clicks * (2 + Math.random() * 5)).toFixed(2);
    data.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      impressions, clicks, spend,
      ctr: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
      avgCpc: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
      conversions: Math.floor(Math.random() * 3),
    });
  }
  return data;
}

async function workerQuery(customerId, query, refreshToken, loginCustomerId) {
  const url = `${WORKER_BASE}/customers/${customerId}/googleAds:search`;
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker API ${response.status}: ${text.substring(0, 300)}`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
}

async function listAccessibleCustomers(refreshToken) {
  const url = `${WORKER_BASE}/customers:listAccessibleCustomers`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'x-user-refresh-token': refreshToken },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`listAccessibleCustomers ${response.status}: ${text.substring(0, 300)}`);
  }

  const data = await response.json();
  const resourceNames = data.resourceNames || [];
  return resourceNames.map((rn) => rn.replace('customers/', ''));
}

/**
 * The client accounts sitting under a manager account.
 *
 * `login-customer-id` must be the manager itself — querying customer_client
 * without it returns nothing, which made every MCC look empty and left the
 * sync recording each one as a bare "manager" with no clients.
 */
async function fetchClientAccounts(mccId, refreshToken) {
  const query = `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level <= 1`;
  const rows = await workerQuery(mccId, query, refreshToken, mccId);

  return rows
    .filter((r) => {
      const c = r.customerClient;
      // Skip the manager itself (level 0) and any nested managers — only real
      // ad-serving accounts belong in the account list.
      return c && !c.manager && String(c.id) !== String(mccId) && c.status === 'ENABLED';
    })
    .map((r) => ({
      customerId: String(r.customerClient.id),
      name: r.customerClient.descriptiveName || `Account ${r.customerClient.id}`,
    }));
}

async function fetchCampaignsForAccount(customerId, refreshToken, loginCustomerId) {
  const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.average_cpc, metrics.ctr FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
  const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  return rows.map((r) => ({
    campaignId: String(r.campaign?.id || ''),
    campaignName: r.campaign?.name || 'Unknown',
    status: r.campaign?.status || 'UNKNOWN',
    spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
    clicks: r.metrics?.clicks || 0,
    impressions: r.metrics?.impressions || 0,
    conversions: r.metrics?.conversions || 0,
    cpc: (r.metrics?.averageCpc || r.metrics?.average_cpc || 0) / 1_000_000,
    ctr: r.metrics?.ctr || 0,
    timestamp: new Date(),
    customerId,
  }));
}

async function fetchCampaignDevicePerformance(customerId, campaignId, refreshToken, loginCustomerId) {
  const query = `SELECT segments.device, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM campaign WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`;
  const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  const perfData = rows.map((r) => ({
    device: r.segments?.device || 'UNKNOWN',
    clicks: r.metrics?.clicks || 0,
    impressions: r.metrics?.impressions || 0,
    spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
    conversions: r.metrics?.conversions || 0,
    ctr: r.metrics?.ctr || 0,
  }));

  let bidModifiers = {};
  try {
    const bidQuery = `SELECT campaign_criterion.criterion_id, campaign_criterion.device.type, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'DEVICE'`;
    const bidRows = await workerQuery(customerId, bidQuery, refreshToken, loginCustomerId);
    bidRows.forEach((r) => {
      const dt = r.campaignCriterion?.device?.type || r.campaign_criterion?.device?.type;
      const bm = r.campaignCriterion?.bidModifier ?? r.campaignCriterion?.bid_modifier ?? r.campaign_criterion?.bid_modifier;
      if (dt && bm != null) bidModifiers[dt] = parseFloat(bm);
    });
  } catch { /* bid modifiers not available */ }

  const deviceSet = new Set(perfData.map((d) => d.device));
  Object.keys(bidModifiers).forEach((dt) => { if (!deviceSet.has(dt)) deviceSet.add(dt); });

  const result = [];
  deviceSet.forEach((dt) => {
    const perf = perfData.find((d) => d.device === dt) || { device: dt, clicks: 0, impressions: 0, spend: 0, conversions: 0, ctr: 0 };
    result.push({ ...perf, bidModifier: bidModifiers[dt] ?? null });
  });

  return result;
}

async function fetchCampaignGeoPerformance(customerId, campaignId, refreshToken, loginCustomerId) {
  const query = `SELECT location_view.resource_name, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM location_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`;
  let rows;
  try {
    rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  } catch {
    // location_view may not be available; try campaign_criterion without metrics
    const fallbackQuery = `SELECT campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'LOCATION'`;
    try {
      const fbRows = await workerQuery(customerId, fallbackQuery, refreshToken, loginCustomerId);
      return fbRows.map((r) => {
        const loc = r.campaignCriterion?.location?.geoTargetConstant || r.campaign_criterion?.location?.geo_target_constant || '';
        const idMatch = loc.match(/\/(\d+)$/);
        return { countryId: idMatch ? idMatch[1] : loc, clicks: 0, impressions: 0, spend: 0, conversions: 0, ctr: 0 };
      });
    } catch {
      return [];
    }
  }
  return rows.map((r) => {
    const rn = r.locationView?.resourceName || r.location_view?.resource_name || '';
    const idMatch = rn.match(/~(\d+)$/);
    return {
      countryId: idMatch ? idMatch[1] : rn,
      clicks: r.metrics?.clicks || 0,
      impressions: r.metrics?.impressions || 0,
      spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
      conversions: r.metrics?.conversions || 0,
      ctr: r.metrics?.ctr || 0,
    };
  });
}

async function fetchCampaignAdCopies(customerId, campaignId, refreshToken, loginCustomerId) {
  const query = `SELECT ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls, ad_group_ad.status, metrics.clicks, metrics.impressions, metrics.ctr FROM ad_group_ad WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`;
  const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  return rows.map((r) => {
    const ad = r.adGroupAd?.ad || r.ad_group_ad?.ad || {};
    const rsa = ad.responsiveSearchAd || ad.responsive_search_ad || {};
    return {
      adId: String(ad.id || ''),
      adGroupId: String(r.adGroup?.id || ''),
      adGroupName: r.adGroup?.name || '',
      headlines: (rsa.headlines || []).map((h) => h.text || h),
      descriptions: (rsa.descriptions || []).map((d) => d.text || d),
      finalUrls: ad.finalUrls || ad.final_urls || [],
      status: r.adGroupAd?.status || r.ad_group_ad?.status || 'UNKNOWN',
      clicks: r.metrics?.clicks || 0,
      impressions: r.metrics?.impressions || 0,
      ctr: r.metrics?.ctr || 0,
    };
  });
}

async function fetchLiveCampaignMetrics() {
  const users = await User.find({
    'googleAdsConfig.refreshToken': { $ne: '' },
    'googleAdsConfig.isConfigured': true,
  }).select('googleAdsConfig');

  if (!users.length) {
    logger.warn('No users with Google Ads connected — skipping live fetch');
    return [];
  }

  const allMetrics = [];

  for (const user of users) {
    const refreshToken = user.googleAdsConfig.refreshToken;
    const mccId = user.googleAdsConfig.managerAccountId;

    try {
      let customerIds = [];

      const accessibleIds = mccId ? [mccId] : await listAccessibleCustomers(refreshToken);
      logger.info(`Accessible IDs: ${accessibleIds.join(', ')}`);

      for (const aid of accessibleIds) {
        try {
          const clients = await fetchClientAccounts(aid, refreshToken);
          if (clients.length > 0) {
            logger.info(`${aid} is MCC — found ${clients.length} client accounts`);
            for (const client of clients) {
              try {
                const campaigns = await fetchCampaignsForAccount(client.customerId, refreshToken, aid);
                allMetrics.push(...campaigns);
                logger.info(`Fetched ${campaigns.length} campaigns for client ${client.customerId} (${client.name})`);
              } catch (err) {
                logger.error(`Failed campaigns for client ${client.customerId}: ${err.message}`);
              }
            }
          } else {
            const campaigns = await fetchCampaignsForAccount(aid, refreshToken);
            allMetrics.push(...campaigns);
            logger.info(`Fetched ${campaigns.length} campaigns for account ${aid}`);
          }
        } catch (err) {
          logger.error(`Failed to process account ${aid}: ${err.message}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to fetch for user ${user._id}: ${error.message}`);
    }
  }

  return allMetrics;
}

async function fetchAndStoreCampaignMetrics() {
  if (isSimulation()) {
    const Account = require('../models/Account');
    const accountCount = await Account.countDocuments();
    if (accountCount === 0) {
      logger.info('Simulation mode: no accounts synced yet — skipping mock metrics');
      return [];
    }
  }
  const metrics = isSimulation() ? generateMockMetrics() : await fetchLiveCampaignMetrics();

  if (!metrics.length) {
    logger.info('No campaign metrics to store this cycle');
    return [];
  }

  const savedDocs = await CampaignMetrics.insertMany(metrics);
  logger.info(`Stored metrics for ${savedDocs.length} campaign(s) [mode=${isSimulation() ? 'SIMULATION' : 'LIVE'}]`);

  await Promise.all(
    metrics.map(({ campaignId, campaignName }) =>
      Campaign.findOneAndUpdate(
        { googleCampaignId: campaignId },
        { $setOnInsert: { googleCampaignId: campaignId, campaignName, campaignType: 'custom', status: 'active' } },
        { upsert: true }
      )
    )
  );

  return savedDocs;
}

async function workerMutate(customerId, operations, refreshToken, loginCustomerId) {
  const url = `${WORKER_BASE}/customers/${customerId}/googleAds:mutate`;
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mutateOperations: operations }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker mutate ${response.status}: ${text.substring(0, 500)}`);
  }

  return response.json();
}

/**
 * POST .../googleAds:searchStream — the streaming counterpart of
 * googleAds:search, used for reports that can run long (search terms over a
 * date range).
 *
 * Unlike :search, the response is an ARRAY of chunks, each with its own
 * `results`. Treating it like :search silently yields nothing, so the chunks
 * are flattened here. A single object is also accepted, since the proxy
 * collapses one-chunk responses.
 */
async function workerSearchStream(customerId, query, refreshToken, loginCustomerId) {
  const url = `${WORKER_BASE}/customers/${customerId}/googleAds:searchStream`;
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query }) });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`searchStream ${response.status}: ${text.substring(0, 500)}`);
  }

  const data = await response.json();
  const chunks = Array.isArray(data) ? data : [data];
  return chunks.flatMap((chunk) => chunk?.results || []);
}

/**
 * Search terms an account actually served against, with their metrics — the
 * report used to spot wasted spend and turn it into negative keywords.
 */
async function fetchSearchTerms(customerId, refreshToken, loginCustomerId, { days = 30, campaignId = null } = {}) {
  const window = `LAST_${[7, 14, 30].includes(Number(days)) ? days : 30}_DAYS`;
  const scope = campaignId ? ` AND campaign.id = ${Number(campaignId)}` : '';

  const query =
    'SELECT search_term_view.search_term, campaign.id, campaign.name, ad_group.id, ad_group.name, ' +
    'metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions ' +
    `FROM search_term_view WHERE segments.date DURING ${window}${scope} ` +
    'ORDER BY metrics.cost_micros DESC LIMIT 500';

  const rows = await workerSearchStream(customerId, query, refreshToken, loginCustomerId);

  return rows.map((r) => ({
    searchTerm: r.searchTermView?.searchTerm || '',
    campaignId: String(r.campaign?.id || ''),
    campaignName: r.campaign?.name || '',
    adGroupId: String(r.adGroup?.id || ''),
    adGroupName: r.adGroup?.name || '',
    clicks: Number(r.metrics?.clicks || 0),
    impressions: Number(r.metrics?.impressions || 0),
    cost: Number(r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
    conversions: Number(r.metrics?.conversions || 0),
  }));
}

/**
 * Add campaign-level negative keywords via campaignCriteria:mutate.
 *
 * Campaign level (not ad group) so one exclusion covers every ad group in the
 * campaign, which is what excluding a wasteful search term should do.
 */
async function addNegativeKeywords(customerId, campaignId, keywords, refreshToken, loginCustomerId) {
  const url = `${WORKER_BASE}/customers/${customerId}/campaignCriteria:mutate`;
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const operations = keywords.map(({ text, matchType }) => ({
    create: {
      campaign: `customers/${customerId}/campaigns/${campaignId}`,
      negative: true,
      keyword: { text, matchType: (matchType || 'EXACT').toUpperCase() },
    },
  }));

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ operations }) });
  const text = await response.text();

  if (!response.ok) {
    // Surface Google's human-readable reason rather than the raw envelope.
    let reason = '';
    try {
      const parsed = JSON.parse(text);
      reason = parsed?.error?.details?.[0]?.errors?.[0]?.message || parsed?.error?.message || '';
    } catch { /* non-JSON body */ }
    throw new Error(reason || `campaignCriteria:mutate ${response.status}: ${text.substring(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getMccBillingInfo(mccId, refreshToken) {
  const query = `SELECT billing_setup.id, billing_setup.payments_account, billing_setup.payments_account_info.payments_account_id, billing_setup.payments_account_info.payments_profile_id, billing_setup.status FROM billing_setup WHERE billing_setup.status = 'APPROVED' LIMIT 1`;
  const rows = await workerQuery(mccId, query, refreshToken);
  if (!rows.length) return null;
  const bs = rows[0].billingSetup;
  return {
    paymentsAccountId: bs?.paymentsAccountInfo?.paymentsAccountId,
    paymentsProfileId: bs?.paymentsAccountInfo?.paymentsProfileId,
    paymentsAccount: bs?.paymentsAccount,
  };
}

async function setupBillingForClient(clientId, mccId, refreshToken) {
  try {
    const billingInfo = await getMccBillingInfo(mccId, refreshToken);
    if (!billingInfo?.paymentsAccountId) {
      logger.warn(`[BILLING] No approved billing setup found on MCC ${mccId}`);
      return null;
    }

    const url = `${WORKER_BASE}/customers/${clientId}/billingSetups:mutate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-user-refresh-token': refreshToken,
        'Content-Type': 'application/json',
        'login-customer-id': mccId,
      },
      body: JSON.stringify({
        operation: {
          create: {
            paymentsAccount: billingInfo.paymentsAccount,
          },
        },
      }),
    });

    const text = await response.text();
    logger.info(`[BILLING] Setup response ${response.status}: ${text.substring(0, 500)}`);

    if (!response.ok) {
      logger.warn(`[BILLING] Failed to setup billing for ${clientId}: ${text.substring(0, 300)}`);
      return null;
    }

    return JSON.parse(text);
  } catch (err) {
    logger.warn(`[BILLING] Error setting up billing for ${clientId}: ${err.message}`);
    return null;
  }
}

/**
 * Google's own verdict on a campaign's ads: whether each is approved, still
 * under review or disapproved, and the policy topics behind that.
 *
 * Approval is Google's decision and nothing here can hurry it, but an ad that
 * sits "under review" indefinitely usually has a reason Google is already
 * reporting — a policy topic, or a limitation like billing not being set up.
 * Without this the dashboard could only say whether the push succeeded, which
 * says nothing about whether the ad will ever run.
 */
async function fetchAdApprovalStatus(customerId, googleCampaignId, refreshToken, loginCustomerId) {
  const query = `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries, ad_group_ad.ad.responsive_search_ad.headlines FROM ad_group_ad WHERE campaign.id = ${googleCampaignId}`;
  const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);

  return rows.map((r) => {
    const summary = r.adGroupAd?.policySummary || {};
    return {
      adId: String(r.adGroupAd?.ad?.id || ''),
      status: r.adGroupAd?.status || '',
      approvalStatus: summary.approvalStatus || 'UNKNOWN',
      reviewStatus: summary.reviewStatus || '',
      // Each entry names a policy and, where Google gives one, why it applied.
      policyTopics: (summary.policyTopicEntries || []).map((e) => ({
        topic: e.topic || '',
        type: e.type || '',
      })),
      headlines: (r.adGroupAd?.ad?.responsiveSearchAd?.headlines || []).map((h) => h.text).filter(Boolean),
    };
  });
}

/**
 * Whether an account can actually spend: its billing setup and account budget.
 *
 * An account with no approved billing keeps its ads unserved no matter how
 * long the review takes, so this is the first thing to check when ads never
 * go live.
 */
async function fetchBillingStatus(customerId, refreshToken, loginCustomerId) {
  const [setupRes, budgetRes] = await Promise.allSettled([
    workerQuery(customerId, 'SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account_info.payments_account_id FROM billing_setup', refreshToken, loginCustomerId),
    workerQuery(customerId, 'SELECT account_budget.id, account_budget.status, account_budget.approved_spending_limit_micros, account_budget.proposed_spending_limit_micros FROM account_budget', refreshToken, loginCustomerId),
  ]);

  const setups = setupRes.status === 'fulfilled'
    ? setupRes.value.map((r) => ({
        id: String(r.billingSetup?.id || ''),
        status: r.billingSetup?.status || '',
        paymentsAccountId: r.billingSetup?.paymentsAccountInfo?.paymentsAccountId || '',
      }))
    : [];

  const budgets = budgetRes.status === 'fulfilled'
    ? budgetRes.value.map((r) => ({
        id: String(r.accountBudget?.id || ''),
        status: r.accountBudget?.status || '',
        limitMicros: r.accountBudget?.approvedSpendingLimitMicros || r.accountBudget?.proposedSpendingLimitMicros || null,
      }))
    : [];

  const approved = setups.find((s) => ['APPROVED', 'APPROVED_HELD'].includes(s.status));

  return {
    billingSetups: setups,
    accountBudgets: budgets,
    hasApprovedBilling: Boolean(approved),
    error: setupRes.status === 'rejected' ? setupRes.reason.message : null,
  };
}

/**
 * The ad groups inside a campaign.
 *
 * Keywords and ads attach to an ad group in Google Ads, never to a campaign
 * directly, so anything pushed for a campaign has to resolve one first.
 */
async function fetchAdGroups(customerId, googleCampaignId, refreshToken, loginCustomerId) {
  const query = `SELECT ad_group.id, ad_group.name, ad_group.resource_name, ad_group.status FROM ad_group WHERE campaign.id = ${googleCampaignId}`;
  const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  return rows
    .filter((r) => r.adGroup && r.adGroup.status !== 'REMOVED')
    .map((r) => ({
      id: String(r.adGroup.id),
      name: r.adGroup.name || '',
      resourceName: r.adGroup.resourceName || `customers/${customerId}/adGroups/${r.adGroup.id}`,
      status: r.adGroup.status,
    }));
}

/**
 * An ad group to attach keywords and ads to: the campaign's first existing
 * one, or a new one when the campaign has none. A campaign created outside
 * this app may legitimately have no ad group yet, and failing in that case
 * would block the operator for no good reason.
 */
async function resolveAdGroup(customerId, googleCampaignId, refreshToken, loginCustomerId) {
  const existing = await fetchAdGroups(customerId, googleCampaignId, refreshToken, loginCustomerId);
  if (existing.length) return existing[0].resourceName;

  logger.info(`[PUSH] Campaign ${googleCampaignId} has no ad group — creating one`);
  return googleAdsService.createAdGroup(
    customerId,
    `customers/${customerId}/campaigns/${googleCampaignId}`,
    { name: 'Ad Group 1', cpcBidMicros: 500000 },
    { refreshToken },
    loginCustomerId
  );
}

/**
 * Add a keyword to Google Ads.
 *
 * A positive keyword becomes an ad group criterion; a negative one is applied
 * at campaign level, which is where negatives belong so they cover every ad
 * group in the campaign.
 */
async function pushKeyword({ customerId, adGroupResource, googleCampaignId, keyword, matchType, isNegative, refreshToken, loginCustomerId }) {
  const criterion = { keyword: { text: keyword, matchType: String(matchType || 'broad').toUpperCase() } };

  const operation = isNegative
    ? {
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${customerId}/campaigns/${googleCampaignId}`,
            negative: true,
            ...criterion,
          },
        },
      }
    : {
        adGroupCriterionOperation: {
          create: { adGroup: adGroupResource, status: 'ENABLED', ...criterion },
        },
      };

  const result = await workerMutate(customerId, [operation], refreshToken, loginCustomerId);
  const res = result.mutateOperationResponses?.[0];
  return res?.adGroupCriterionResult?.resourceName || res?.campaignCriterionResult?.resourceName || null;
}

/**
 * Invitations Google is currently holding for an account, plus the users who
 * already have access.
 *
 * This is how "the invite never arrived" gets settled: if Google lists it as
 * PENDING then it was accepted by the API and the problem is delivery
 * (spam/Promotions), not the request. If it isn't listed, the invite never
 * reached Google at all.
 */
async function fetchAccountAccess(customerId, refreshToken, loginCustomerId) {
  const invitationQuery = `SELECT customer_user_access_invitation.invitation_id, customer_user_access_invitation.email_address, customer_user_access_invitation.access_role, customer_user_access_invitation.creation_date_time, customer_user_access_invitation.invitation_status FROM customer_user_access_invitation`;
  const userQuery = `SELECT customer_user_access.user_id, customer_user_access.email_address, customer_user_access.access_role FROM customer_user_access`;

  // One failing must not hide the other — a pending invitation is still worth
  // reporting when the user list is unavailable, and vice versa.
  const [invRes, userRes] = await Promise.allSettled([
    workerQuery(customerId, invitationQuery, refreshToken, loginCustomerId),
    workerQuery(customerId, userQuery, refreshToken, loginCustomerId),
  ]);

  const invitations = invRes.status === 'fulfilled'
    ? invRes.value.map((r) => ({
        invitationId: String(r.customerUserAccessInvitation?.invitationId || ''),
        email: r.customerUserAccessInvitation?.emailAddress || '',
        accessRole: r.customerUserAccessInvitation?.accessRole || '',
        status: r.customerUserAccessInvitation?.invitationStatus || '',
        createdAt: r.customerUserAccessInvitation?.creationDateTime || null,
      }))
    : [];

  const users = userRes.status === 'fulfilled'
    ? userRes.value.map((r) => ({
        email: r.customerUserAccess?.emailAddress || '',
        accessRole: r.customerUserAccess?.accessRole || '',
      }))
    : [];

  return {
    invitations,
    users,
    invitationsError: invRes.status === 'rejected' ? invRes.reason.message : null,
    usersError: userRes.status === 'rejected' ? userRes.reason.message : null,
  };
}

async function sendAccountInvite(customerId, emailAddress, accessRole, refreshToken, loginCustomerId) {
  const url = `${WORKER_BASE}/customers/${customerId}/customerUserAccessInvitations:mutate`;
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const reqBody = {
    operation: {
      create: {
        emailAddress,
        accessRole: accessRole || 'ADMIN',
      },
    },
  };

  logger.info(`[INVITE] POST ${url}`);
  logger.info(`[INVITE] Body: ${JSON.stringify(reqBody)}`);
  logger.info(`[INVITE] login-customer-id: ${loginCustomerId || 'none'}`);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(reqBody),
  });

  const text = await response.text();
  logger.info(`[INVITE] Response ${response.status}: ${text.substring(0, 500)}`);

  if (!response.ok) {
    let errMsg = `Invite failed (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      const gadsErr = parsed.error?.details?.[0]?.errors?.[0];
      if (gadsErr) {
        const code = Object.values(gadsErr.errorCode || {})[0] || '';
        errMsg = gadsErr.message || code || errMsg;
        if (code) errMsg += ` [${code}]`;
      }
    } catch { /* use default errMsg */ }
    throw new Error(errMsg);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/* ------------------------------------------------------------------ *
 * Multi-MCC support
 *
 * A single login can operate several manager accounts. Every Google Ads
 * request against a client account must carry the MCC it lives under as
 * `login-customer-id`, so the MCC that actually accepted an account is
 * recorded on the Account document (`sourceMccId`) at creation time.
 * ------------------------------------------------------------------ */

/**
 * Every accessible customer id that is itself a manager (MCC) account.
 * `listAccessibleCustomers` returns managers and plain clients mixed
 * together, so each one is probed individually.
 */
async function findAllMccIds(refreshToken) {
  const ids = await listAccessibleCustomers(refreshToken);
  const mccIds = [];
  for (const id of ids) {
    try {
      const rows = await workerQuery(id, 'SELECT customer.manager FROM customer LIMIT 1', refreshToken, id);
      if (rows[0]?.customer?.manager === true) mccIds.push(id);
    } catch {
      // Not reachable with this token, or not a manager — skip it.
    }
  }
  return mccIds;
}

/** First manager account this token can reach, or null. */
async function findMccId(refreshToken) {
  const [first] = await findAllMccIds(refreshToken);
  return first || null;
}

/**
 * Decide which MCCs a provisioning request may use, most specific first:
 *   1. an MCC explicitly picked in the request,
 *   2. the MCC list saved on the user's Google Ads settings,
 *   3. every manager account discovered from the token.
 */
async function resolveMccIds({ refreshToken, requestedMccId, configuredMccIds }) {
  if (requestedMccId) return [String(requestedMccId)];

  const configured = (configuredMccIds || []).map(String).filter(Boolean);
  if (configured.length) return configured;

  // Discovery is a best-effort last resort. It reaches out to Google, so it
  // can fail for reasons that have nothing to do with which MCCs exist (an
  // expired token, the API being unreachable). Returning [] here lets the
  // caller report the actionable "no MCC selected" message instead of leaking
  // a raw transport error, while the cause is still logged.
  try {
    return await findAllMccIds(refreshToken);
  } catch (err) {
    logger.warn(`[MCC] Discovery failed, treating as no MCC available: ${err.message}`);
    return [];
  }
}

const NO_MCC_MESSAGE =
  'No MCC selected. Choose a manager account, or add one under Settings → MCC (Manager Account) IDs, before creating accounts.';

/**
 * An account must always be created under a known MCC in production —
 * provisioning into whatever manager account happens to be reachable is how
 * live accounts end up under the wrong one. Development stays permissive so
 * the flow can be exercised without a real Google connection.
 */
function assertMccAvailable(mccIds) {
  if (mccIds.length) return;
  if (env.nodeEnv === 'production') {
    const err = new Error(NO_MCC_MESSAGE);
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Create a client account, trying each candidate MCC in turn.
 *
 * An MCC can refuse a new client for reasons specific to it (billing not
 * approved, client limit reached, no permission), so a failure on one MCC
 * is not fatal while another may still accept — only when every MCC has
 * failed does this throw, reporting each MCC's own error.
 */
async function createClientAccount(refreshToken, { name, currencyCode, timeZone, mccId, configuredMccIds }) {
  const mccIds = await resolveMccIds({ refreshToken, requestedMccId: mccId, configuredMccIds });
  assertMccAvailable(mccIds);
  if (!mccIds.length) throw new Error('No accessible MCC (manager) account found for this Google Ads connection');

  const failures = [];

  for (const candidateMcc of mccIds) {
    try {
      const url = `${WORKER_BASE}/customers/${candidateMcc}:createCustomerClient`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-user-refresh-token': refreshToken,
          'Content-Type': 'application/json',
          'login-customer-id': candidateMcc,
        },
        body: JSON.stringify({
          customerId: candidateMcc,
          customerClient: {
            descriptiveName: name,
            currencyCode: currencyCode || 'USD',
            timeZone: timeZone || 'Asia/Kolkata',
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        failures.push(`MCC ${candidateMcc}: ${response.status} — ${text.substring(0, 300)}`);
        continue;
      }

      const parsed = await response.json();
      // resourceName format: "customers/<MCC_ID>/customerClients/<NEW_ID>"
      const resourceName = parsed.resourceName || '';
      const customerId = resourceName.split('/').pop() || '';
      if (!customerId) {
        failures.push(`MCC ${candidateMcc}: response contained no customer id`);
        continue;
      }

      logger.info(`[MCC] Account "${name}" created as ${customerId} under MCC ${candidateMcc}`);
      return { customerId, mccId: candidateMcc, resourceName };
    } catch (err) {
      failures.push(`MCC ${candidateMcc}: ${err.message}`);
    }
  }

  throw new Error(`All ${mccIds.length} MCC(s) failed to create the account — ${failures.join(' | ')}`);
}

/**
 * Link the client to the paying MCC's payments account and set its
 * account-level spending limit to `billingBudget`.
 *
 * Mirrors the manual Billing wizard in the Google Ads UI. `billingBudget` is
 * always operator-supplied so the spending limit is exactly what was asked
 * for. Idempotent: an existing budget at the same limit is left alone, a
 * different limit is proposed as an UPDATE, and only a missing one is
 * created.
 */
async function setupAccountBilling(customerId, billingBudget, refreshToken, loginCustomerId) {
  const headers = {
    'x-user-refresh-token': refreshToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  // 1) Payments account reachable for this customer (consolidated billing).
  const paRes = await fetch(`${WORKER_BASE}/customers/${customerId}/paymentsAccounts`, { method: 'GET', headers });
  if (!paRes.ok) throw new Error(`paymentsAccounts ${paRes.status}: ${(await paRes.text()).substring(0, 500)}`);
  const paData = await paRes.json();
  const paymentsAccount = paData.paymentsAccounts?.[0]?.resourceName;
  if (!paymentsAccount) throw new Error('No payments account accessible for this customer');

  // 2) Billing setup. Reuse an approved one; a PENDING one (a stuck manual
  //    wizard attempt) blocks budgets, so cancel it and create a fresh setup,
  //    which auto-approves under the paying MCC.
  const existing = await workerQuery(
    customerId,
    'SELECT billing_setup.id, billing_setup.status FROM billing_setup',
    refreshToken,
    loginCustomerId
  );
  const approved = existing.find((b) => ['APPROVED', 'APPROVED_HELD'].includes(b.billingSetup?.status));
  let billingSetupResource = approved?.billingSetup?.resourceName;

  if (!billingSetupResource) {
    const pending = existing.find((b) => b.billingSetup?.status === 'PENDING');
    if (pending) {
      const rmRes = await fetch(`${WORKER_BASE}/customers/${customerId}/billingSetups:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ operation: { remove: pending.billingSetup.resourceName } }),
      });
      if (!rmRes.ok) throw new Error(`billingSetup remove ${rmRes.status}: ${(await rmRes.text()).substring(0, 500)}`);
    }

    const bsRes = await fetch(`${WORKER_BASE}/customers/${customerId}/billingSetups:mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operation: { create: { paymentsAccount, startTimeType: 'NOW' } } }),
    });
    const bsText = await bsRes.text();
    if (!bsRes.ok) throw new Error(`billingSetup ${bsRes.status}: ${bsText.substring(0, 500)}`);
    billingSetupResource = JSON.parse(bsText)?.result?.resourceName;
  }

  // 3) Account budget = the operator-supplied spending limit.
  const wantMicros = String(Math.round(Number(billingBudget) * 1_000_000));
  const budgets = await workerQuery(
    customerId,
    'SELECT account_budget.id, account_budget.status, account_budget.approved_spending_limit_micros, account_budget.proposed_spending_limit_micros FROM account_budget',
    refreshToken,
    loginCustomerId
  );
  const current = budgets.find((b) => ['APPROVED', 'PENDING'].includes(b.accountBudget?.status));
  const currentMicros =
    current?.accountBudget?.approvedSpendingLimitMicros || current?.accountBudget?.proposedSpendingLimitMicros;

  if (current && String(currentMicros) === wantMicros) {
    return { billingSetupResource, accountBudget: 'already-set' };
  }

  // Proposals are always "created"; proposalType decides CREATE vs UPDATE.
  const operation = current
    ? {
        create: {
          proposalType: 'UPDATE',
          accountBudget: current.accountBudget.resourceName,
          proposedSpendingLimitMicros: wantMicros,
        },
      }
    : {
        create: {
          billingSetup: billingSetupResource,
          proposalType: 'CREATE',
          proposedName: 'Account budget',
          proposedStartTimeType: 'NOW',
          proposedEndTimeType: 'FOREVER',
          proposedSpendingLimitMicros: wantMicros,
        },
      };

  const abRes = await fetch(`${WORKER_BASE}/customers/${customerId}/accountBudgetProposals:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operation }),
  });
  const abText = await abRes.text();
  if (!abRes.ok) throw new Error(`accountBudget ${abRes.status}: ${abText.substring(0, 500)}`);

  return { billingSetupResource };
}

/**
 * Update an existing campaign's daily budget in Google Ads.
 * Used when an operator edits the budget after the campaign is live.
 */
async function updateCampaignBudgetAmount(customerId, budgetResourceName, dailyBudget, refreshToken, loginCustomerId) {
  const result = await workerMutate(
    customerId,
    [
      {
        campaignBudgetOperation: {
          update: {
            resourceName: budgetResourceName,
            amountMicros: String(Math.round(Number(dailyBudget) * 1_000_000)),
          },
          updateMask: 'amount_micros',
        },
      },
    ],
    refreshToken,
    loginCustomerId
  );
  return result;
}

const googleAdsService = {
  workerQuery,
  workerMutate,
  listAccessibleCustomers,
  fetchClientAccounts,
  fetchCampaignsForAccount,
  fetchAndStoreCampaignMetrics,
  generateMockMetrics,
  sendAccountInvite,
  fetchAccountAccess,
  setupBillingForClient,

  // Google's own verdict on ads, and whether the account can spend at all.
  fetchAdApprovalStatus,
  fetchBillingStatus,

  // Pushing locally-authored keywords and ad copies into Google Ads.
  fetchAdGroups,
  resolveAdGroup,
  pushKeyword,

  // Search terms report + campaign-level negative keywords
  workerSearchStream,
  fetchSearchTerms,
  addNegativeKeywords,

  // Multi-MCC + billing
  NO_MCC_MESSAGE,
  findAllMccIds,
  findMccId,
  resolveMccIds,
  createClientAccount,
  setupAccountBilling,
  updateCampaignBudgetAmount,

  async getCampaignPerformance(customerId, campaignId, dateFrom, dateTo, credentials) {
    if (isSimulation()) return generateSimulatedPerformance(dateFrom, dateTo);

    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) return generateSimulatedPerformance(dateFrom, dateTo);

    try {
      const query = `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.average_cpc FROM campaign WHERE campaign.id = ${campaignId} AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
      const rows = await workerQuery(customerId, query, refreshToken);
      return rows.map((r) => ({
        date: r.segments?.date || '',
        impressions: r.metrics?.impressions || 0,
        clicks: r.metrics?.clicks || 0,
        spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
        ctr: r.metrics?.impressions > 0 ? +((r.metrics.clicks / r.metrics.impressions) * 100).toFixed(2) : 0,
        avgCpc: (r.metrics?.averageCpc || r.metrics?.average_cpc || 0) / 1_000_000,
        conversions: r.metrics?.conversions || 0,
      }));
    } catch (err) {
      logger.error(`getCampaignPerformance live failed: ${err.message}`);
      return generateSimulatedPerformance(dateFrom, dateTo);
    }
  },

  async getAccountPerformance(customerId, dateFrom, dateTo, credentials) {
    if (isSimulation()) return generateSimulatedPerformance(dateFrom, dateTo);

    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) return generateSimulatedPerformance(dateFrom, dateTo);

    try {
      const query = `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.average_cpc FROM customer WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
      const rows = await workerQuery(customerId, query, refreshToken);
      return rows.map((r) => ({
        date: r.segments?.date || '',
        impressions: r.metrics?.impressions || 0,
        clicks: r.metrics?.clicks || 0,
        spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
        ctr: r.metrics?.impressions > 0 ? +((r.metrics.clicks / r.metrics.impressions) * 100).toFixed(2) : 0,
        avgCpc: (r.metrics?.averageCpc || r.metrics?.average_cpc || 0) / 1_000_000,
        conversions: r.metrics?.conversions || 0,
      }));
    } catch (err) {
      logger.error(`getAccountPerformance live failed: ${err.message}`);
      return generateSimulatedPerformance(dateFrom, dateTo);
    }
  },

  async createAccount(account, credentials) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token available');

    const accessibleIds = await listAccessibleCustomers(refreshToken);
    if (!accessibleIds.length) throw new Error('No MCC found');
    const mccId = accessibleIds[0];

    const url = `${WORKER_BASE}/customers/${mccId}:createCustomerClient`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-user-refresh-token': refreshToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: mccId,
        customerClient: {
          descriptiveName: account.accountName,
          currencyCode: account.currency || 'USD',
          timeZone: account.timeZone || 'Asia/Dubai',
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`createAccount ${response.status}: ${text.substring(0, 300)}`);
    }

    const result = await response.json();
    const resourceName = result.resourceName || '';
    const newCustomerId = resourceName.split('/').pop() || resourceName;

    if (newCustomerId) {
      logger.info(`[BILLING] Auto-linking billing for new account ${newCustomerId} under MCC ${mccId}`);
      await setupBillingForClient(newCustomerId, mccId, refreshToken);
    }

    return newCustomerId;
  },

  async createCampaignBudget(customerId, budgetAmountMicros, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token');

    const result = await workerMutate(customerId, [{
      campaignBudgetOperation: {
        create: {
          name: `Budget_${customerId}_${Date.now()}`,
          amountMicros: String(budgetAmountMicros),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    }], refreshToken, loginCustomerId);

    const budgetResource = result.mutateOperationResponses?.[0]?.campaignBudgetResult?.resourceName;
    if (!budgetResource) throw new Error('No budget resource returned');
    return budgetResource;
  },

  async createCampaign(customerId, template, budgetResource, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token');

    const result = await workerMutate(customerId, [{
      campaignOperation: {
        create: {
          name: `${template.name}_${Date.now()}`,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: budgetResource,
          manualCpc: {},
          networkSettings: {
            targetGoogleSearch: template.networkSettings?.targetGoogleSearch ?? true,
            targetSearchNetwork: template.networkSettings?.targetSearchNetwork ?? false,
            targetContentNetwork: template.networkSettings?.targetContentNetwork ?? false,
          },
          containsEuPoliticalAdvertising: 2,
        },
      },
    }], refreshToken, loginCustomerId);

    const campaignResource = result.mutateOperationResponses?.[0]?.campaignResult?.resourceName;
    if (!campaignResource) throw new Error('No campaign resource returned');
    return campaignResource;
  },

  async createAdGroup(customerId, campaignResource, adGroupConfig, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token');

    const result = await workerMutate(customerId, [{
      adGroupOperation: {
        create: {
          name: adGroupConfig.name || 'Ad Group',
          campaign: campaignResource,
          type: 'SEARCH_STANDARD',
          cpcBidMicros: String(adGroupConfig.cpcBidMicros || 500000),
          status: 'ENABLED',
        },
      },
    }], refreshToken, loginCustomerId);

    const adGroupResource = result.mutateOperationResponses?.[0]?.adGroupResult?.resourceName;
    if (!adGroupResource) throw new Error('No ad group resource returned');
    return adGroupResource;
  },

  async createCampaignCriteria(customerId, campaignResource, geoTargets, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken || !geoTargets?.length) return;

    const operations = geoTargets.map((geoId) => ({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResource,
          location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
        },
      },
    }));

    await workerMutate(customerId, operations, refreshToken, loginCustomerId);
  },

  async createKeywords(customerId, adGroupResource, keywords, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken || !keywords?.length) return;

    const operations = keywords.map((kw) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResource,
          keyword: { text: kw, matchType: 'BROAD' },
          status: 'ENABLED',
        },
      },
    }));

    await workerMutate(customerId, operations, refreshToken, loginCustomerId);
  },

  async createResponsiveSearchAd(customerId, adGroupResource, adConfig, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) throw new Error('No Google Ads refresh token available');

    // Google requires at least 3 headlines and 2 descriptions for a
    // responsive search ad. Rejecting here gives a clear reason instead of an
    // opaque API error.
    const headlines = (adConfig.headlines || []).filter(Boolean).slice(0, 15);
    const descriptions = (adConfig.descriptions || []).filter(Boolean).slice(0, 4);

    if (headlines.length < 3) {
      throw new Error(`Google Ads needs at least 3 headlines for a responsive search ad (got ${headlines.length})`);
    }
    if (descriptions.length < 2) {
      throw new Error(`Google Ads needs at least 2 descriptions for a responsive search ad (got ${descriptions.length})`);
    }

    const result = await workerMutate(customerId, [{
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResource,
          ad: {
            responsiveSearchAd: {
              headlines: headlines.map((text) => ({ text })),
              descriptions: descriptions.map((text) => ({ text })),
            },
            finalUrls: [adConfig.finalUrl],
          },
          status: 'ENABLED',
        },
      },
    }], refreshToken, loginCustomerId);

    return result.mutateOperationResponses?.[0]?.adGroupAdResult?.resourceName || null;
  },

  async enableCampaign(customerId, campaignResource, credentials, loginCustomerId) {
    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) return;

    await workerMutate(customerId, [{
      campaignOperation: {
        update: {
          resourceName: campaignResource,
          status: 'ENABLED',
        },
        updateMask: 'status',
      },
    }], refreshToken, loginCustomerId);
  },

  async pauseCampaign(customerId, campaignId, credentials = {}, loginCustomerId = null) {
    if (isSimulation()) {
      logger.debug(`[MOCK] Pausing campaign ${campaignId} in mock mode`);
      return { success: true, message: 'Mock pause successful' };
    }

    const refreshToken = credentials?.refreshToken;
    if (!refreshToken) {
      logger.warn(`No refresh token available to pause campaign ${campaignId}`);
      return { success: false, message: 'No authentication credentials' };
    }

    try {
      const resourceName = `customers/${customerId}/campaigns/${campaignId}`;
      await workerMutate(customerId, [{
        campaignOperation: {
          update: {
            resourceName,
            status: 'PAUSED',
          },
          updateMask: 'status',
        },
      }], refreshToken, loginCustomerId);

      logger.info(`Campaign ${campaignId} paused successfully via Google Ads API`);
      return { success: true, message: 'Campaign paused in Google Ads' };
    } catch (error) {
      logger.error(`Failed to pause campaign ${campaignId}: ${error.message}`);
      return { success: false, message: error.message };
    }
  },
};

async function fetchCampaignAudiencePerformance(customerId, campaignId, refreshToken, loginCustomerId) {
  const queries = [
    `SELECT campaign_audience_view.resource_name, ad_group_criterion.audience.audience_segment, ad_group_criterion.display_name, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM campaign_audience_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`,
    `SELECT ad_group_criterion.display_name, ad_group_criterion.type, ad_group_criterion.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type IN ('AUDIENCE') AND segments.date DURING LAST_30_DAYS`,
    `SELECT ad_group_criterion.display_name, ad_group_criterion.type, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type IN ('AUDIENCE', 'USER_LIST', 'USER_INTEREST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE') AND ad_group_criterion.negative = FALSE`,
  ];

  for (const query of queries) {
    try {
      const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          name: r.adGroupCriterion?.displayName || r.adGroupCriterion?.display_name || 'Unknown Audience',
          segment: r.adGroupCriterion?.audience?.audienceSegment || r.adGroupCriterion?.audience?.audience_segment || null,
          status: r.adGroupCriterion?.status || 'ENABLED',
          type: r.adGroupCriterion?.type || 'AUDIENCE',
          clicks: r.metrics?.clicks || 0,
          impressions: r.metrics?.impressions || 0,
          spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
          conversions: r.metrics?.conversions || 0,
          ctr: r.metrics?.ctr || 0,
        }));
      }
    } catch { /* try next query */ }
  }
  return [];
}

async function fetchCampaignExclusions(customerId, campaignId, refreshToken, loginCustomerId) {
  const queries = [
    `SELECT campaign_criterion.display_name, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.status, campaign_criterion.location.geo_target_constant, campaign_criterion.keyword.text, campaign_criterion.criterion_id FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE`,
    `SELECT ad_group_criterion.display_name, ad_group_criterion.type, ad_group_criterion.negative, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.criterion_id FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.negative = TRUE`,
  ];

  const allExclusions = [];
  for (const query of queries) {
    try {
      const rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
      if (rows && rows.length > 0) {
        rows.forEach((r) => {
          const src = r.campaignCriterion || r.campaign_criterion || r.adGroupCriterion || r.ad_group_criterion || {};
          const isCampaign = !!(r.campaignCriterion || r.campaign_criterion);
          let name = src.displayName || src.display_name || '';
          if (!name && src.keyword?.text) name = src.keyword.text;
          if (!name && src.location?.geoTargetConstant) name = src.location.geoTargetConstant;
          if (!name && src.location?.geo_target_constant) name = src.location.geo_target_constant;
          if (!name) name = `Criterion #${src.criterionId || src.criterion_id || '?'}`;
          allExclusions.push({
            name,
            type: src.type || 'UNKNOWN',
            level: isCampaign ? 'Campaign' : 'Ad Group',
          });
        });
      }
    } catch { /* skip */ }
  }
  return allExclusions;
}

async function fetchCampaignDemographics(customerId, campaignId, refreshToken, loginCustomerId) {
  const ageQuery = `SELECT ad_group_criterion.age_range.type, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM age_range_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`;
  const genderQuery = `SELECT ad_group_criterion.gender.type, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM gender_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS`;

  let age = [];
  let gender = [];

  try {
    const rows = await workerQuery(customerId, ageQuery, refreshToken, loginCustomerId);
    age = rows.map((r) => ({
      type: r.adGroupCriterion?.ageRange?.type || r.adGroupCriterion?.age_range?.type || 'UNKNOWN',
      clicks: r.metrics?.clicks || 0,
      impressions: r.metrics?.impressions || 0,
      spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
      conversions: r.metrics?.conversions || 0,
      ctr: r.metrics?.ctr || 0,
    }));
  } catch { age = []; }

  try {
    const rows = await workerQuery(customerId, genderQuery, refreshToken, loginCustomerId);
    gender = rows.map((r) => ({
      type: r.adGroupCriterion?.gender?.type || r.adGroupCriterion?.gender?.type || 'UNKNOWN',
      clicks: r.metrics?.clicks || 0,
      impressions: r.metrics?.impressions || 0,
      spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
      conversions: r.metrics?.conversions || 0,
      ctr: r.metrics?.ctr || 0,
    }));
  } catch { gender = []; }

  return { age, gender };
}

async function fetchCampaignKeywords(customerId, campaignId, refreshToken, loginCustomerId) {
  const query = `SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.ctr FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND metrics.impressions > 0 AND segments.date DURING LAST_30_DAYS`;
  let rows = [];
  try {
    rows = await workerQuery(customerId, query, refreshToken, loginCustomerId);
  } catch {
    const fallbackQuery = `SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE`;
    try { rows = await workerQuery(customerId, fallbackQuery, refreshToken, loginCustomerId); } catch { rows = []; }
  }
  return rows.map((r) => ({
    criterionId: r.adGroupCriterion?.criterionId || r.adGroupCriterion?.criterion_id,
    adGroupId: r.adGroup?.id,
    adGroupName: r.adGroup?.name,
    keyword: r.adGroupCriterion?.keyword?.text,
    matchType: r.adGroupCriterion?.keyword?.matchType || r.adGroupCriterion?.keyword?.match_type,
    status: r.adGroupCriterion?.status,
    clicks: r.metrics?.clicks || 0,
    impressions: r.metrics?.impressions || 0,
    spend: (r.metrics?.costMicros || r.metrics?.cost_micros || 0) / 1_000_000,
    ctr: r.metrics?.ctr || 0,
  }));
}

async function mutateCampaignKeyword(customerId, adGroupId, criterionId, action, refreshToken, loginCustomerId, updates) {
  const resourceName = `customers/${customerId}/adGroupCriteria/${adGroupId}~${criterionId}`;
  let operation;
  if (action === 'edit' && updates) {
    const adGroupRN = `customers/${customerId}/adGroups/${adGroupId}`;
    const ops = [
      { adGroupCriterionOperation: { remove: resourceName } },
      { adGroupCriterionOperation: { create: { adGroup: adGroupRN, status: 'ENABLED', keyword: { text: updates.keyword, matchType: updates.matchType } } } },
    ];
    return workerMutate(customerId, ops, refreshToken, loginCustomerId);
  } else if (action === 'remove') {
    operation = { adGroupCriterionOperation: { remove: resourceName } };
  } else if (action === 'pause') {
    operation = { adGroupCriterionOperation: { update: { resourceName, status: 'PAUSED' }, updateMask: 'status' } };
  } else if (action === 'enable') {
    operation = { adGroupCriterionOperation: { update: { resourceName, status: 'ENABLED' }, updateMask: 'status' } };
  } else {
    throw new Error(`Unknown keyword action: ${action}`);
  }
  return workerMutate(customerId, [operation], refreshToken, loginCustomerId);
}

async function mutateCampaignDevice(customerId, campaignId, deviceType, bidModifier, action, refreshToken, loginCustomerId) {
  const query = `SELECT campaign_criterion.criterion_id, campaign_criterion.device.type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'DEVICE' AND campaign_criterion.device.type = '${deviceType}'`;
  let rows = [];
  try { rows = await workerQuery(customerId, query, refreshToken, loginCustomerId); } catch { rows = []; }

  if (action === 'remove') {
    if (!rows.length) return { message: 'No device criterion to reset' };
    const criterionId = rows[0].campaignCriterion?.criterionId || rows[0].campaignCriterion?.criterion_id;
    const resourceName = `customers/${customerId}/campaignCriteria/${campaignId}~${criterionId}`;
    const campaignRN = `customers/${customerId}/campaigns/${campaignId}`;
    return workerMutate(customerId, [{ campaignCriterionOperation: { update: { resourceName, bidModifier: 1.0, campaign: campaignRN }, updateMask: 'bid_modifier' } }], refreshToken, loginCustomerId);
  }

  const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
  let operation;

  if (rows.length > 0) {
    const criterionId = rows[0].campaignCriterion?.criterionId || rows[0].campaignCriterion?.criterion_id;
    const resourceName = `customers/${customerId}/campaignCriteria/${campaignId}~${criterionId}`;
    operation = { campaignCriterionOperation: { update: { resourceName, bidModifier: bidModifier, campaign: campaignResourceName }, updateMask: 'bid_modifier' } };
  } else {
    operation = { campaignCriterionOperation: { create: { campaign: campaignResourceName, device: { type: deviceType }, bidModifier: bidModifier } } };
  }

  return workerMutate(customerId, [operation], refreshToken, loginCustomerId);
}

async function mutateCampaignAd(customerId, adGroupId, adId, action, refreshToken, loginCustomerId, updates) {
  const resourceName = `customers/${customerId}/adGroupAds/${adGroupId}~${adId}`;
  let operation;
  if (action === 'edit' && updates) {
    const adGroupRN = `customers/${customerId}/adGroups/${adGroupId}`;
    const headlines = (updates.headlines || []).map((h, i) => ({ text: h, pinnedField: i < 3 ? undefined : undefined }));
    const descriptions = (updates.descriptions || []).map((d) => ({ text: d }));
    const ops = [
      { adGroupAdOperation: { remove: resourceName } },
      { adGroupAdOperation: { create: { adGroup: adGroupRN, status: 'ENABLED', ad: { responsiveSearchAd: { headlines, descriptions }, finalUrls: updates.finalUrls || ['https://example.com'] } } } },
    ];
    return workerMutate(customerId, ops, refreshToken, loginCustomerId);
  } else if (action === 'remove') {
    operation = { adGroupAdOperation: { remove: resourceName } };
  } else if (action === 'pause') {
    operation = { adGroupAdOperation: { update: { resourceName, status: 'PAUSED' }, updateMask: 'status' } };
  } else if (action === 'enable') {
    operation = { adGroupAdOperation: { update: { resourceName, status: 'ENABLED' }, updateMask: 'status' } };
  } else {
    throw new Error(`Unknown ad action: ${action}`);
  }
  return workerMutate(customerId, [operation], refreshToken, loginCustomerId);
}

googleAdsService.fetchCampaignDevicePerformance = fetchCampaignDevicePerformance;
googleAdsService.fetchCampaignGeoPerformance = fetchCampaignGeoPerformance;
googleAdsService.fetchCampaignAdCopies = fetchCampaignAdCopies;
googleAdsService.fetchCampaignAudiencePerformance = fetchCampaignAudiencePerformance;
googleAdsService.fetchCampaignExclusions = fetchCampaignExclusions;
googleAdsService.fetchCampaignDemographics = fetchCampaignDemographics;
googleAdsService.fetchCampaignKeywords = fetchCampaignKeywords;
googleAdsService.mutateCampaignKeyword = mutateCampaignKeyword;
googleAdsService.mutateCampaignAd = mutateCampaignAd;
googleAdsService.mutateCampaignDevice = mutateCampaignDevice;
googleAdsService.pauseCampaign = googleAdsService.pauseCampaign;

module.exports = googleAdsService;
