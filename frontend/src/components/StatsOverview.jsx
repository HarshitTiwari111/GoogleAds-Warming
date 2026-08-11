function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

/**
 * Shows both the live campaign/alert KPIs (Project B) and the account
 * lifecycle counts (Project A) side by side on the Dashboard, so a single
 * glance covers "how healthy is monitoring" and "how many accounts are
 * mid-provisioning".
 */
export default function StatsOverview({ campaigns = [], alerts = [], accountStats }) {
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
  const needsAttention = campaigns.filter((c) => c.status && c.status !== 'HEALTHY').length;
  const alertsSent = alerts.filter((a) => a.status === 'SENT').length;

  const campaignStats = [
    { label: 'Active Campaigns', value: campaigns.length, accent: 'blue' },
    { label: 'Total Spend', value: formatCurrency(totalSpend), accent: 'purple' },
    { label: 'Total Clicks', value: totalClicks, accent: 'teal' },
    { label: 'Needs Attention', value: needsAttention, accent: needsAttention > 0 ? 'red' : 'green' },
    { label: 'Alerts Sent', value: alertsSent, accent: 'amber' },
  ];

  const accountStatsList = accountStats
    ? [
        { label: 'Total Accounts', value: accountStats.total ?? 0, accent: 'blue' },
        { label: 'In Warm-up', value: accountStats.warmup ?? 0, accent: 'amber' },
        { label: 'Active Accounts', value: accountStats.active ?? 0, accent: 'green' },
        { label: 'Pending Setup', value: accountStats.pending ?? 0, accent: 'purple' },
        { label: 'Failed Setup', value: accountStats.failed ?? 0, accent: (accountStats.failed ?? 0) > 0 ? 'red' : 'teal' },
      ]
    : [];

  return (
    <>
      {accountStatsList.length > 0 && (
        <div className="stats-grid">
          {accountStatsList.map((s) => (
            <div key={s.label} className={`stat-card stat-${s.accent}`}>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="stats-grid">
        {campaignStats.map((s) => (
          <div key={s.label} className={`stat-card stat-${s.accent}`}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
