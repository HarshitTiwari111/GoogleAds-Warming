import StatusBadge from './StatusBadge';

export default function ReportTable({ reports }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Account</th>
            <th>Customer ID</th>
            <th>Campaigns</th>
            <th>Impressions</th>
            <th>Clicks</th>
            <th>Spend</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>Conv.</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r, i) => (
            <tr key={r._id}>
              <td>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.account?.accountName || '-'}</td>
              <td className="info-value mono">{r.account?.clientName || '-'}</td>
              <td>{r.enabledCount}/{r.campaignCount}</td>
              <td>{(r.metrics?.totalImpressions || 0).toLocaleString()}</td>
              <td>{(r.metrics?.totalClicks || 0).toLocaleString()}</td>
              <td>${(r.metrics?.totalSpend || 0).toFixed(2)}</td>
              <td>{(r.metrics?.avgCtr || 0).toFixed(2)}%</td>
              <td>${(r.metrics?.avgCpc || 0).toFixed(2)}</td>
              <td>{r.metrics?.totalConversions || 0}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
          {reports.length === 0 && (
            <tr>
              <td colSpan={11} className="empty-row">
                No reports yet. Sync your Google Ads accounts first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
