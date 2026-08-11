import StatusBadge from './StatusBadge';

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

/**
 * `mediaBuyers` + `onAssign` are only passed by admins - media buyers and
 * other roles get the plain read-only table without the assignment column.
 * Also renders the account/campaign type + daily budget columns when the
 * campaign objects include them (manual campaigns ported from Project A),
 * falling back gracefully for live-monitored campaigns that don't.
 */
export default function CampaignTable({ campaigns, mediaBuyers, onAssign }) {
  const showAssignment = Boolean(mediaBuyers && onAssign);

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Live?</th>
            <th>Spend</th>
            <th>Clicks</th>
            <th>Landing Clicks</th>
            <th>GCLID Count</th>
            <th>Status</th>
            <th>Last Alert Time</th>
            {showAssignment && <th>Assigned To</th>}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.campaignId || c._id}>
              <td>
                {c.campaignName}
                {c.dailyBudget != null && <div className="cell-sub">${Number(c.dailyBudget).toFixed(2)}/day</div>}
              </td>
              <td>
                <span className={`live-pill ${c.campaignStatus === 'ENABLED' ? 'live-pill-on' : 'live-pill-off'}`}>
                  <span className="live-pill-dot" />
                  {c.campaignStatus === 'ENABLED' ? 'Live' : c.campaignStatus === 'PAUSED' ? 'Paused' : c.campaignStatus || 'Removed'}
                </span>
              </td>
              <td>{formatCurrency(c.spend)}</td>
              <td>{c.clicks ?? 0}</td>
              <td>{c.landingClicks ?? 0}</td>
              <td>{c.gclidCount ?? 0}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td>{formatTime(c.lastAlertTime)}</td>
              {showAssignment && (
                <td>
                  <select
                    className="assign-select"
                    value={c.assignedTo?.userId || c.assignedTo?._id || c.assignedTo || ''}
                    onChange={(e) => onAssign(c.campaignId || c._id, e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {mediaBuyers.map((buyer) => (
                      <option key={buyer._id} value={buyer._id}>
                        {buyer.name}
                      </option>
                    ))}
                  </select>
                </td>
              )}
            </tr>
          ))}
          {campaigns.length === 0 && (
            <tr>
              <td colSpan={showAssignment ? 9 : 8} className="empty-row">
                No campaign data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
