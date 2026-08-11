const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Strips a bot token out of an error message before it's logged/persisted.
 * Some axios failure modes (malformed URL, certain network errors) echo the
 * full request URL - which embeds the bot token - into `error.message`;
 * this keeps that token out of logs/AlertHistory even in those cases.
 */
function redactBotToken(text, botToken) {
  if (!text || !botToken) return text;
  return text.split(botToken).join('***redacted***');
}

/**
 * Formats the alert exactly per the project spec's Telegram template.
 */
function formatAlertMessage({ campaignName, spend, clicks, landingClicks, gclidCount, recommendation, timestamp }) {
  return [
    '🚨 Google Ads Alert',
    '',
    'Campaign:',
    campaignName,
    '',
    'Spend:',
    `$${Number(spend).toFixed(2)}`,
    '',
    'Clicks:',
    String(clicks),
    '',
    'Landing Clicks:',
    String(landingClicks),
    '',
    'GCLID Count:',
    String(gclidCount),
    '',
    'Recommendation:',
    recommendation,
    '',
    'Time:',
    new Date(timestamp).toLocaleString(),
  ].join('\n');
}

/**
 * Sends a message via the Telegram Bot API, using a specific bot token and
 * chat. Each media buyer can run their own bot (own token), so nobody -
 * including the admin - can read another buyer's messages via a shared
 * bot's getUpdates. Returns { ok, description } so callers can persist the
 * outcome to AlertHistory without throwing on misconfiguration.
 */
async function sendTelegramMessage(text, chatId, botToken) {
  if (!botToken || !chatId) {
    logger.warn('Telegram not configured (no bot token or chat ID for this recipient) - skipping send');
    return { ok: false, description: 'Telegram bot token or chat ID not configured' };
  }

  try {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: chatId,
      text,
    });
    return { ok: true, description: JSON.stringify(response.data.result?.message_id || response.data) };
  } catch (error) {
    const description = redactBotToken(error.response?.data?.description || error.message, botToken);
    logger.error(`Telegram send failed: ${description}`);
    return { ok: false, description };
  }
}

/**
 * @param {object} alertData - see formatAlertMessage
 * @param {string} [chatId] - destination chat. Falls back to the shared
 *   TELEGRAM_CHAT_ID (env) when the campaign has no assigned media buyer,
 *   or the buyer hasn't set up their own Telegram yet.
 * @param {string} [botToken] - the bot to send through. Falls back to the
 *   shared TELEGRAM_BOT_TOKEN (env) under the same conditions as chatId.
 */
async function sendAlert(alertData, chatId, botToken) {
  const message = formatAlertMessage(alertData);
  const result = await sendTelegramMessage(message, chatId || env.telegram.chatId, botToken || env.telegram.botToken);
  return { ...result, message };
}

module.exports = {
  formatAlertMessage,
  sendTelegramMessage,
  sendAlert,
};
