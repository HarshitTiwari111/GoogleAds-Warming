import { Clock, AlertTriangle, RotateCcw, Pause } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { campaignsApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useState } from 'react';

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : 'No alerts yet';
}

const STATUS_ACCENT = {
  HEALTHY: 'accent-green',
  WARNING: 'accent-amber',
  CRITICAL: 'accent-red',
};

function SpendBar({ spend, spendLimit }) {
  if (!spendLimit) return null;

  const percent = Math.min((spend / spendLimit) * 100, 100);
  const overLimit = spend > spendLimit;
  const barClass = overLimit ? 'spend-bar-fill-red' : percent >= 75 ? 'spend-bar-fill-amber' : 'spend-bar-fill-green';

  return (
    <div className="spend-bar-wrapper">
      <div className="spend-bar-labels">
        <span>{formatCurrency(spend)} spent</span>
        <span className={overLimit ? 'spend-bar-over' : ''}>
          {overLimit ? 'Over ' : ''}
          limit {formatCurrency(spendLimit)}
        </span>
      </div>
      <div className="spend-bar-track">
        <div className={`spend-bar-fill ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function CampaignCard({ campaign, onWarningUpdate }) {
  const { showToast } = useToast();
  const [resuming, setResuming] = useState(false);
  const isLive = campaign.campaignStatus === 'ENABLED';
  const warning = campaign.noClicksWarning;
  const isAutoPaused = warning?.isAutoPaused;

  const handleResume = async (e) => {
    e.stopPropagation();
    setResuming(true);
    try {
      await campaignsApi.resumeCampaign(campaign.campaignId);
      showToast('Campaign resumed successfully!', 'success');
      if (onWarningUpdate) onWarningUpdate();
    } catch (err) {
      showToast('Failed to resume campaign', 'error');
    } finally {
      setResuming(false);
    }
  };

  return (
    <div className={`card ${STATUS_ACCENT[campaign.status] || 'accent-green'}`}>
      <div className="card-header">
        <div>
          <h3>{campaign.campaignName}</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`live-pill ${isLive ? 'live-pill-on' : 'live-pill-off'}`}>
              <span className="live-pill-dot" />
              {isLive ? 'Live' : campaign.campaignStatus === 'PAUSED' ? 'Paused' : 'Removed'}
            </span>
            {isAutoPaused && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                <Pause size={11} />
                Auto-Paused
              </span>
            )}
            {warning && warning.count > 0 && !isAutoPaused && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                <AlertTriangle size={11} />
                Warning {warning.count}/{warning.warningLimit}
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <SpendBar spend={campaign.spend} spendLimit={campaign.spendLimit} />

      <div className="card-metrics">
        <div className="metric">
          <span className="metric-label">Spend</span>
          <span className="metric-value">{formatCurrency(campaign.spend)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Clicks</span>
          <span className="metric-value">{campaign.clicks ?? 0}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Landing Clicks</span>
          <span className="metric-value">{campaign.landingClicks ?? 0}</span>
        </div>
        <div className="metric">
          <span className="metric-label">GCLID Count</span>
          <span className="metric-value">{campaign.gclidCount ?? 0}</span>
        </div>
      </div>

      {isAutoPaused && warning?.pauseReason && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#fecaca',
          borderLeft: '3px solid #dc2626',
          borderRadius: '4px',
          marginBottom: '8px'
        }}>
          <span style={{ fontSize: '12px', color: '#7f1d1d', display: 'block' }}>
            <strong>Reason:</strong> {warning.pauseReason}
          </span>
        </div>
      )}

      {campaign.recommendation && (
        <div className="card-recommendation">
          <span className="metric-label">Recommendation</span>
          <p>{campaign.recommendation}</p>
        </div>
      )}

      {isAutoPaused && (
        <button
          onClick={handleResume}
          disabled={resuming}
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: '8px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: resuming ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            opacity: resuming ? 0.7 : 1
          }}
        >
          <RotateCcw size={14} />
          {resuming ? 'Resuming...' : 'Resume Campaign'}
        </button>
      )}

      <div className="card-footer">
        <Clock size={13} />
        Last alert: {formatTime(campaign.lastAlertTime)}
      </div>
    </div>
  );
}
