function formatTime(value) {
  return new Date(value).toLocaleString();
}

const STATUS_PILL_CLASS = {
  SENT: 'pill-success',
  FAILED: 'pill-error',
  MUTED: 'pill-neutral',
};

export default function AlertHistoryTable({ alerts }) {
  return (
    <div className="table-wrapper table-scroll-limited">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Campaign</th>
            <th>Rule</th>
            <th>Recommendation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert._id}>
              <td>{formatTime(alert.sentAt)}</td>
              <td>{alert.campaignName}</td>
              <td>{alert.ruleName || alert.ruleType}</td>
              <td>{alert.recommendation}</td>
              <td>
                <span className={`pill ${STATUS_PILL_CLASS[alert.status] || 'pill-error'}`}>{alert.status}</span>
              </td>
            </tr>
          ))}
          {alerts.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-row">
                No alerts sent yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
