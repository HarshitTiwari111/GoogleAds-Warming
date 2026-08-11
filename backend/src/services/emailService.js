const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;
if (env.email.user && env.email.pass) {
  transporter = nodemailer.createTransport({
    host: env.email.host || 'smtp.gmail.com',
    port: env.email.port || 587,
    secure: false,
    auth: { user: env.email.user, pass: env.email.pass },
  });
  logger.info(`[EMAIL] SMTP configured: ${env.email.user}`);
} else {
  logger.warn('[EMAIL] SMTP not configured (EMAIL_USER / EMAIL_PASS missing)');
}

const sendEmail = async (to, subject, html) => {
  if (!transporter) {
    logger.warn(`[EMAIL] Skipped (SMTP not configured): ${subject} -> ${to}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: env.email.from || `"Google Ads Automation" <${env.email.user}>`,
      to,
      subject,
      html,
    });
    logger.info(`[EMAIL] Sent: ${subject} -> ${to}`);
  } catch (error) {
    logger.error(`[EMAIL] Failed: ${error.message}`);
  }
};

const statusLabels = {
  pending: { label: 'Pending', color: '#e65100' },
  created: { label: 'Created', color: '#1565c0' },
  warmup: { label: 'Warm-up', color: '#f9a825' },
  active: { label: 'Active', color: '#2e7d32' },
  paused: { label: 'Paused', color: '#7b1fa2' },
  failed: { label: 'Failed', color: '#c62828' },
};

exports.sendStatusChangeEmail = async (userEmail, account, oldStatus, newStatus) => {
  const s = statusLabels[newStatus] || { label: newStatus, color: '#333' };
  const subject = `Account "${account.accountName}" status changed to ${s.label}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
      <h2 style="margin:0 0 16px;color:#1a1a2e;">Account Status Update</h2>
      <p style="margin:0 0 20px;color:#374151;">The status of your Google Ads account has been updated.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Account</td><td style="padding:10px 0;font-weight:600;">${account.accountName}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Client</td><td style="padding:10px 0;">${account.clientName}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Previous Status</td><td style="padding:10px 0;">${oldStatus}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">New Status</td><td style="padding:10px 0;"><span style="background:${s.color}22;color:${s.color};padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">${s.label}</span></td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Ads Automation Dashboard</p>
    </div>
  `;
  await sendEmail(userEmail, subject, html);
};

exports.sendAccountCreatedEmail = async (toEmail, { accountName, customerId, currency, timeZone }) => {
  const creationDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const subject = 'Google Ads Account Created Successfully';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#4285f4;color:#fff;width:56px;height:56px;border-radius:50%;line-height:56px;font-size:24px;">&#10003;</div>
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;text-align:center;">Account Created Successfully!</h2>
      <p style="margin:0 0 24px;color:#374151;text-align:center;">Your new Google Ads account has been set up and is ready to use.</p>
      <div style="background:#fff;border-radius:8px;padding:20px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">Account Name</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #f3f4f6;">${accountName}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">Customer ID</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #f3f4f6;">${customerId}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">Currency</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${currency}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">Time Zone</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${timeZone}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Created On</td><td style="padding:10px 0;">${creationDate}</td></tr>
        </table>
      </div>
      <p style="margin:24px 0 0;color:#374151;text-align:center;font-size:14px;">Thank you for using our platform. Your account is now active and ready for campaigns.</p>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Google Ads Automation Dashboard</p>
    </div>
  `;
  await sendEmail(toEmail, subject, html);
};

exports.sendEmail = sendEmail;
