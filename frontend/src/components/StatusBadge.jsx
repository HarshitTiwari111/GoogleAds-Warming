const STATUS_STYLES = {
  HEALTHY: { className: 'status-healthy', label: 'Healthy' },
  WARNING: { className: 'status-warning', label: 'Warning' },
  CRITICAL: { className: 'status-critical', label: 'Critical' },

  // Account / campaign / report lifecycle statuses (Project A domain)
  active: { className: 'status-healthy', label: 'Active' },
  enabled: { className: 'status-healthy', label: 'Active' },
  warmup: { className: 'status-warning', label: 'Warm-up' },
  pending: { className: 'status-warning', label: 'Pending' },
  created: { className: 'status-neutral', label: 'Created' },
  draft: { className: 'status-neutral', label: 'Draft' },
  paused: { className: 'status-neutral', label: 'Paused' },
  generating: { className: 'status-warning', label: 'Generating' },
  ready: { className: 'status-healthy', label: 'Ready' },
  completed: { className: 'status-healthy', label: 'Completed' },
  failed: { className: 'status-critical', label: 'Failed' },
};

export default function StatusBadge({ status }) {
  const key = typeof status === 'string' ? status : '';
  const style = STATUS_STYLES[key] || STATUS_STYLES[key.toUpperCase?.()] || { className: 'status-neutral', label: key || 'Unknown' };
  return (
    <span className={`status-badge ${style.className}`}>
      <span className="status-dot" />
      {style.label}
    </span>
  );
}
