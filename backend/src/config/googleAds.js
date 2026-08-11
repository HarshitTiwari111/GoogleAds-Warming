const { GoogleAdsApi } = require('google-ads-api');
const env = require('./env');

/**
 * Builds a GoogleAdsApi client. Accepts an optional credentials override
 * (e.g. a user's per-account googleAdsConfig) and falls back to env-level
 * Google Ads credentials otherwise.
 */
const getGoogleAdsClient = (credentials = {}) => {
  return new GoogleAdsApi({
    client_id: credentials.clientId || env.googleAds.clientId,
    client_secret: credentials.clientSecret || env.googleAds.clientSecret,
    developer_token: credentials.developerToken || env.googleAds.developerToken,
  });
};

/**
 * Builds a Customer instance for a given customer_id, using the shared
 * client factory above. `credentials.refreshToken` / `managerAccountId`
 * override env-level defaults when provided (per-user Google Ads config).
 */
const getCustomer = (customerId, credentials = {}) => {
  const client = getGoogleAdsClient(credentials);
  return client.Customer({
    customer_id: customerId,
    refresh_token: credentials.refreshToken || env.googleAds.refreshToken,
    login_customer_id: credentials.managerAccountId || env.googleAds.managerAccountId,
  });
};

module.exports = { getGoogleAdsClient, getCustomer };
