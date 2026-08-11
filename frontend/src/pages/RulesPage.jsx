import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { rulesApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

function RuleCard({ rule, onSave }) {
  const [form, setForm] = useState({
    enabled: rule.enabled,
    threshold: rule.threshold ?? '',
    secondaryThreshold: rule.secondaryThreshold ?? '',
    windowMinutes: rule.windowMinutes ?? '',
    cooldownMinutes: rule.cooldownMinutes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    form.enabled !== rule.enabled ||
    String(form.threshold) !== String(rule.threshold ?? '') ||
    String(form.secondaryThreshold) !== String(rule.secondaryThreshold ?? '') ||
    String(form.windowMinutes) !== String(rule.windowMinutes ?? '') ||
    String(form.cooldownMinutes) !== String(rule.cooldownMinutes ?? '');

  const handleChange = (field) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleToggle = () => {
    setSaved(false);
    setForm((f) => ({ ...f, enabled: !f.enabled }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(rule._id, {
        enabled: form.enabled,
        threshold: form.threshold === '' ? undefined : Number(form.threshold),
        secondaryThreshold: form.secondaryThreshold === '' ? undefined : Number(form.secondaryThreshold),
        windowMinutes: form.windowMinutes === '' ? undefined : Number(form.windowMinutes),
        cooldownMinutes: form.cooldownMinutes === '' ? undefined : Number(form.cooldownMinutes),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rule-card ${!form.enabled ? 'rule-disabled' : ''}`}>
      <div className="rule-card-header">
        <div>
          <h3>{rule.name || rule.type}</h3>
          <p className="rule-description">{rule.description}</p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={form.enabled} onChange={handleToggle} />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="rule-fields">
        <label className="field">
          <span>Threshold</span>
          <input type="number" step="any" value={form.threshold} onChange={handleChange('threshold')} />
        </label>
        {rule.secondaryThreshold != null && rule.type === 'HIGH_CLICKS_LOW_GCLID' && (
          <label className="field">
            <span>Secondary Threshold</span>
            <input
              type="number"
              step="any"
              value={form.secondaryThreshold}
              onChange={handleChange('secondaryThreshold')}
            />
          </label>
        )}
        <label className="field">
          <span>Window (minutes)</span>
          <input type="number" min="0" value={form.windowMinutes} onChange={handleChange('windowMinutes')} />
        </label>
        <label className="field">
          <span>Cooldown (minutes)</span>
          <input type="number" min="0" value={form.cooldownMinutes} onChange={handleChange('cooldownMinutes')} />
        </label>
      </div>

      <div className="rule-card-footer">
        {saved && !isDirty ? <span className="saved-indicator">Saved</span> : <span />}
        <button className="refresh-btn" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const { showToast } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRules = () => {
    setLoading(true);
    return rulesApi
      .list()
      .then((res) => {
        setRules(unwrap(res) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSave = async (id, payload) => {
    try {
      await rulesApi.update(id, payload);
      showToast('Rule updated');
      loadRules();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update rule', 'error');
      throw err;
    }
  };

  return (
    <div className="page">
      <PageHeader title="Alert Rules" subtitle="Configure thresholds and cooldowns for monitoring alerts" onRefresh={loadRules} />

      {error && (
        <div className="error-banner">
          Could not load rules. ({error.message})
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading rules…" />
      ) : rules.length === 0 ? (
        <div className="table-wrapper">
          <table>
            <tbody>
              <tr>
                <td className="empty-row">No alert rules configured.</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rules-grid">
          {rules.map((rule) => (
            <RuleCard key={rule._id} rule={rule} onSave={handleSave} />
          ))}
        </div>
      )}
    </div>
  );
}
