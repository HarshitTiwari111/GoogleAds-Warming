import axios from 'axios';

const TOKEN_KEY = 'gads_automation_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track whether a token refresh is already in progress so concurrent 401s
// don't trigger multiple refresh calls. Queued callers wait for the same
// refresh promise and then retry with the new token.
let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb) {
  refreshSubscribers.push(cb);
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401, and not on the refresh endpoint itself,
    // and not if we already retried this request.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // Another refresh is already in flight - queue this request
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = data.token;
        localStorage.setItem(TOKEN_KEY, newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        onRefreshed(newToken);
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear everything and redirect to login
        localStorage.removeItem(TOKEN_KEY);
        refreshSubscribers = [];
        if (!window.location.hash.includes('/login')) {
          window.location.hash = '#/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const TOKEN_STORAGE_KEY = TOKEN_KEY;

export const authApi = {
  login: (email, password, twoFactorToken) =>
    api.post('/auth/login', { email, password, twoFactorToken }).then((res) => res.data),
  me: () => api.get('/auth/me').then((res) => res.data),
  updateProfile: (data) => api.put('/auth/profile', data).then((res) => res.data),
  changePassword: (data) => api.put('/auth/change-password', data).then((res) => res.data),
  logout: () => api.post('/auth/logout').then((res) => res.data),
  sessions: () => api.get('/auth/sessions').then((res) => res.data),
};

export const auditApi = {
  myHistory: (params) => api.get('/audit-logs/me', { params }).then((res) => res.data),
  list: (params) => api.get('/audit-logs', { params }).then((res) => res.data),
};

export const twoFactorApi = {
  status: () => api.get('/auth/2fa/status').then((res) => res.data),
  setup: () => api.post('/auth/2fa/setup').then((res) => res.data),
  verify: (token) => api.post('/auth/2fa/verify', { token }).then((res) => res.data),
  disable: (password) => api.post('/auth/2fa/disable', { password }).then((res) => res.data),
};

export const accountsApi = {
  stats: () => api.get('/accounts/stats').then((res) => res.data),
  list: (params) => api.get('/accounts', { params }).then((res) => res.data),
  googleAds: () => api.get('/accounts/google-ads').then((res) => res.data),
  /** Every campaign from the synced snapshot, across all linked accounts. */
  syncedCampaigns: () => api.get('/accounts/google-ads/campaigns').then((res) => res.data),
  googleAdsCampaigns: (customerId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignDevices: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/devices`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignGeo: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/geo`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignAds: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/ads`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignAudience: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/audience`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignDemographics: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/demographics`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignExclusions: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/exclusions`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  campaignKeywords: (customerId, campaignId, mccId) => api.get(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/keywords`, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  mutateKeyword: (customerId, adGroupId, criterionId, action, mccId, updates) => api.post(`/accounts/google-ads/${customerId}/adgroups/${adGroupId}/criteria/${criterionId}/mutate`, { action, updates }, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  mutateAd: (customerId, adGroupId, adId, action, mccId, updates) => api.post(`/accounts/google-ads/${customerId}/adgroups/${adGroupId}/ads/${adId}/mutate`, { action, updates }, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  mutateDeviceBid: (customerId, campaignId, deviceType, bidModifier, mccId, action) => api.post(`/accounts/google-ads/${customerId}/campaigns/${campaignId}/device-bid`, { deviceType, bidModifier, action }, { params: mccId ? { mccId } : {} }).then((res) => res.data),
  // Search terms report, and excluding a term at campaign level.
  searchTerms: (customerId, { mccId, campaignId, days } = {}) =>
    api.get(`/accounts/google-ads/${customerId}/search-terms`, {
      params: { ...(mccId && { mccId }), ...(campaignId && { campaignId }), ...(days && { days }) },
    }).then((res) => res.data),
  addNegativeKeywords: (customerId, campaignId, keywords, mccId) =>
    api.post(
      `/accounts/google-ads/${customerId}/campaigns/${campaignId}/negative-keywords`,
      { keywords },
      { params: mccId ? { mccId } : {} }
    ).then((res) => res.data),

  syncGoogleAds: () => api.post('/accounts/google-ads/sync').then((res) => res.data),
  createGoogleAdsAccount: (data) => api.post('/accounts/google-ads/create', data).then((res) => res.data),
  bulkCreateGoogleAdsAccounts: (data) => api.post('/accounts/google-ads/bulk-create', data).then((res) => res.data),
  sendInvite: (data) => api.post('/accounts/google-ads/invite', data).then((res) => res.data),
  // Invite using the address stored on an account record (falls back to it
  // when `email` is omitted).
  inviteAccount: (id, email) => api.post(`/accounts/${id}/invite`, email ? { email } : {}).then((res) => res.data),
  /** Pending invitations + users with access, straight from Google. */
  accountAccess: (id) => api.get(`/accounts/${id}/invitations`).then((res) => res.data),
  get: (id) => api.get(`/accounts/${id}`).then((res) => res.data),
  create: (data) => api.post('/accounts', data).then((res) => res.data),
  update: (id, data) => api.put(`/accounts/${id}`, data).then((res) => res.data),
  remove: (id) => api.delete(`/accounts/${id}`).then((res) => res.data),
  sync: (id) => api.post(`/accounts/${id}/sync`).then((res) => res.data),
};

export const campaignsApi = {
  list: () => api.get('/campaigns').then((res) => res.data),
  create: (data) => api.post('/campaigns', data).then((res) => res.data),
  getByAccount: (accountId) => api.get(`/campaigns/account/${accountId}`).then((res) => res.data),
  get: (id) => api.get(`/campaigns/${id}`).then((res) => res.data),
  update: (id, data) => api.put(`/campaigns/${id}`, data).then((res) => res.data),
  history: (campaignId, params) => api.get(`/campaigns/${campaignId}/history`, { params }).then((res) => res.data),
  assign: (campaignId, assignedTo) =>
    api.put(`/campaigns/${campaignId}/assign`, { assignedTo }).then((res) => res.data),

  // No-Clicks Auto-Warning & Auto-Pause APIs
  getMonitoring: () => api.get('/campaigns/monitoring').then((res) => res.data),
  getWarningStatus: (campaignId) => api.get(`/campaigns/${campaignId}/warning-status`).then((res) => res.data),
  resumeCampaign: (campaignId) => api.post(`/campaigns/${campaignId}/resume`).then((res) => res.data),
  updateWarningLimit: (campaignId, warningLimit) =>
    api.put(`/campaigns/${campaignId}/warning-limit`, { warningLimit }).then((res) => res.data),

  remove: (id) => api.delete(`/campaigns/${id}`).then((res) => res.data),
  setStatus: (id, status) => api.patch(`/campaigns/${id}/status`, { status }).then((res) => res.data),

  /** Apply the same keywords and/or ad copies to several campaigns at once. */
  bulkAddContent: (campaignIds, { keywords, ads }) =>
    api.post('/campaigns/bulk/content', { campaignIds, keywords, ads }).then((res) => res.data),

  /** Retry: send this campaign's not-yet-synced keywords and ad copies. */
  pushContent: (campaignId) =>
    api.post(`/campaigns/${campaignId}/push-content`).then((res) => res.data),
};

/* ------------------------------------------------------------------ *
 * Warming/farming side — ported from the Warming-Farming project.
 * ------------------------------------------------------------------ */

export const keywordsApi = {
  list: (campaignId, params) =>
    api.get(campaignId ? `/campaigns/${campaignId}/keywords` : '/keywords', { params }).then((res) => res.data),
  create: (campaignId, data) => api.post(`/campaigns/${campaignId}/keywords`, data).then((res) => res.data),
  createBulk: (campaignId, keywords) =>
    api.post(`/campaigns/${campaignId}/keywords/bulk`, { keywords }).then((res) => res.data),
  update: (id, data) => api.put(`/keywords/${id}`, data).then((res) => res.data),
  remove: (id) => api.delete(`/keywords/${id}`).then((res) => res.data),
};

export const adCopiesApi = {
  list: (campaignId, params) =>
    api.get(campaignId ? `/campaigns/${campaignId}/ads` : '/ads', { params }).then((res) => res.data),
  create: (campaignId, data) => api.post(`/campaigns/${campaignId}/ads`, data).then((res) => res.data),
  get: (id) => api.get(`/ads/${id}`).then((res) => res.data),
  update: (id, data) => api.put(`/ads/${id}`, data).then((res) => res.data),
  remove: (id) => api.delete(`/ads/${id}`).then((res) => res.data),
};

export const publishApi = {
  publish: (campaignId) => api.post(`/publish/${campaignId}`).then((res) => res.data),
  history: (campaignId) =>
    api.get(campaignId ? `/publish/history/${campaignId}` : '/publish/history').then((res) => res.data),
};

export const warmingApi = {
  list: () => api.get('/warming').then((res) => res.data),
  status: (accountId) => api.get(`/warming/${accountId}`).then((res) => res.data),
  // `schedule` accepts either an explicit day/budget array or a generator
  // spec { days, startBudget, endBudget } — both operator-controlled.
  start: (accountId, schedule) => api.post(`/warming/${accountId}/start`, schedule || {}).then((res) => res.data),
  advance: (accountId) => api.post(`/warming/${accountId}/advance`).then((res) => res.data),
  reset: (accountId) => api.post(`/warming/${accountId}/reset`).then((res) => res.data),
  previewSchedule: (params) => api.get('/warming/schedule/preview', { params }).then((res) => res.data),
};

export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }).then((res) => res.data),
  unread: () => api.get('/notifications/unread').then((res) => res.data),
  markRead: (id) => api.put(`/notifications/${id}/read`).then((res) => res.data),
  markAllRead: () => api.put('/notifications/read-all').then((res) => res.data),
};

export const activityLogsApi = {
  list: (params) => api.get('/activity-logs', { params }).then((res) => res.data),
};

/** Workspace-wide option lists and default budgets. */
export const appSettingsApi = {
  list: (category) => api.get('/app-settings', { params: category ? { category } : {} }).then((res) => res.data),
  get: (key) => api.get(`/app-settings/${key}`).then((res) => res.data),
  upsert: (data) => api.post('/app-settings', data).then((res) => res.data),
  remove: (key) => api.delete(`/app-settings/${key}`).then((res) => res.data),
  seed: () => api.post('/app-settings/seed').then((res) => res.data),
};

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then((res) => res.data),
};

export const performanceApi = {
  overall: (params) => api.get('/performance/overall', { params }).then((res) => res.data),
  getByAccount: (accountId, params) => api.get(`/performance/${accountId}`, { params }).then((res) => res.data),
  summary: (accountId) => api.get(`/performance/${accountId}/summary`).then((res) => res.data),
};

export const reportsApi = {
  list: () => api.get('/reports').then((res) => res.data),
  create: (data) => api.post('/reports', data).then((res) => res.data),
  get: (id) => api.get(`/reports/${id}`).then((res) => res.data),
  getByAccount: (accountId) => api.get(`/reports/account/${accountId}`).then((res) => res.data),
  exportCsv: () => api.get('/reports/export/csv', { responseType: 'blob' }),
  exportPdf: () => api.get('/reports/export/pdf', { responseType: 'blob' }),
};

export const settingsApi = {
  get: () => api.get('/settings').then((res) => res.data),
  update: (data) => api.put('/settings', data).then((res) => res.data),
  getOAuthUrl: () => api.get('/settings/oauth-url').then((res) => res.data),
  saveToken: (data) => api.post('/settings/save-token', data).then((res) => res.data),
  usersStatus: () => api.get('/settings/users-status').then((res) => res.data),

  // Multi-MCC: the saved list, and discovery of every manager account the
  // connected Google login can actually reach.
  getMccIds: () => api.get('/settings/mccs').then((res) => res.data),
  updateMccIds: (mccIds) => api.put('/settings/mccs', { mccIds }).then((res) => res.data),
  discoverMccIds: () => api.get('/settings/mccs/discover').then((res) => res.data),
};

export const alertsApi = {
  list: (params) => api.get('/alerts', { params }).then((res) => res.data),
};

export const rulesApi = {
  list: () => api.get('/rules').then((res) => res.data),
  get: (id) => api.get(`/rules/${id}`).then((res) => res.data),
  create: (data) => api.post('/rules', data).then((res) => res.data),
  update: (id, data) => api.put(`/rules/${id}`, data).then((res) => res.data),
  remove: (id) => api.delete(`/rules/${id}`).then((res) => res.data),
};

export const usersApi = {
  me: () => api.get('/users/me').then((res) => res.data),
  updateMe: (data) => api.put('/users/me', data).then((res) => res.data),
  list: () => api.get('/users').then((res) => res.data),
  create: (data) => api.post('/users', data).then((res) => res.data),
  update: (id, data) => api.put(`/users/${id}`, data).then((res) => res.data),
  remove: (id) => api.delete(`/users/${id}`).then((res) => res.data),
  removePermanent: (id) => api.delete(`/users/${id}/permanent`).then((res) => res.data),
};

export const healthApi = {
  check: () => api.get('/health').then((res) => res.data),
};

/**
 * Unwraps common API response envelopes ({ data: [...] } or a bare array/
 * object) so callers don't need to know which shape a given endpoint uses.
 */
export function unwrap(response) {
  if (response && typeof response === 'object' && 'data' in response && !Array.isArray(response)) {
    return response.data;
  }
  return response;
}

export default api;
