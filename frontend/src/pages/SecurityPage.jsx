import { useEffect, useState } from 'react';
import { Shield, MonitorSmartphone, History } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { twoFactorApi, authApi, auditApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

const ACTION_LABELS = {
  LOGIN: 'Login',
  LOGIN_FAILED: 'Failed login',
  LOGOUT: 'Logout',
  PASSWORD_CHANGE: 'Password changed',
  ACCOUNT_LOCKED: 'Account locked',
  ACCOUNT_UNLOCKED: 'Account unlocked',
  '2FA_ENABLED': '2FA enabled',
  '2FA_DISABLED': '2FA disabled',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '-');

export default function SecurityPage() {
  const { showToast } = useToast();

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFALoading, setTwoFALoading] = useState(true);
  const [twoFAStep, setTwoFAStep] = useState('idle'); // idle | setup | backupCodes
  const [qrCode, setQrCode] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const [twoFASaving, setTwoFASaving] = useState(false);

  // Sessions + login history
  const [sessions, setSessions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    twoFactorApi.status()
      .then((res) => setTwoFAEnabled(res.enabled))
      .catch(() => {})
      .finally(() => setTwoFALoading(false));
  }, []);

  useEffect(() => {
    Promise.all([authApi.sessions(), auditApi.myHistory({ limit: 25 })])
      .then(([sessRes, histRes]) => {
        setSessions(unwrap(sessRes) || []);
        setHistory(unwrap(histRes) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const handleSetup2FA = async () => {
    setTwoFAError('');
    setTwoFASaving(true);
    try {
      const res = await twoFactorApi.setup();
      setQrCode(res.qrCode);
      setManualSecret(res.secret);
      setTwoFAStep('setup');
    } catch (err) {
      setTwoFAError(err.response?.data?.message || 'Failed to setup 2FA');
    } finally {
      setTwoFASaving(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setTwoFAError('');
    setTwoFASaving(true);
    try {
      const res = await twoFactorApi.verify(verifyCode);
      setBackupCodes(res.backupCodes);
      setTwoFAStep('backupCodes');
      setTwoFAEnabled(true);
      setVerifyCode('');
      showToast('Two-factor authentication enabled');
    } catch (err) {
      setTwoFAError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setTwoFASaving(false);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    setTwoFAError('');
    setTwoFASaving(true);
    try {
      await twoFactorApi.disable(disablePassword);
      setTwoFAEnabled(false);
      setTwoFAStep('idle');
      setDisablePassword('');
      setQrCode('');
      setManualSecret('');
      showToast('Two-factor authentication disabled');
    } catch (err) {
      setTwoFAError(err.response?.data?.message || 'Failed to disable 2FA');
    } finally {
      setTwoFASaving(false);
    }
  };

  const handleClose2FABackup = () => {
    setTwoFAStep('idle');
    setBackupCodes([]);
    setQrCode('');
    setManualSecret('');
  };

  return (
    <div className="page">
      <PageHeader title="Security" subtitle="Two-factor authentication, active sessions & login history" />

      {error && (
        <div className="error-banner">
          Could not load security data. ({error.message})
        </div>
      )}

      <div className="panel-card profile-card" style={{ maxWidth: 'none' }}>
        <div className="panel-card-header">
          <div className="icon-badge icon-badge-indigo">
            <Shield size={18} />
          </div>
          <div>
            <h3>Two-Factor Authentication</h3>
            <p>Add an extra layer of security to your account</p>
          </div>
          {twoFAEnabled && twoFAStep === 'idle' && (
            <span style={{ marginLeft: 'auto', background: 'var(--green, #22c55e)', color: '#fff', borderRadius: 6, padding: '2px 10px', fontSize: '0.82rem', fontWeight: 600 }}>Enabled</span>
          )}
        </div>

        {twoFAError && <div className="error-banner">{twoFAError}</div>}

        {twoFALoading ? (
          <p style={{ color: 'var(--text-muted, #888)', padding: '8px 0' }}>Checking 2FA status...</p>
        ) : twoFAStep === 'idle' && !twoFAEnabled ? (
          <div>
            <p style={{ color: 'var(--text-muted, #888)', marginBottom: 12 }}>
              Protect your account with a time-based one-time password (TOTP) from an authenticator app like Google Authenticator or Authy.
            </p>
            <div className="form-actions">
              <button type="button" className="refresh-btn" onClick={handleSetup2FA} disabled={twoFASaving}>
                {twoFASaving ? 'Setting up...' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        ) : twoFAStep === 'setup' ? (
          <div>
            <p style={{ color: 'var(--text-muted, #888)', marginBottom: 12 }}>
              Scan the QR code below with your authenticator app, then enter the 6-digit code to verify.
            </p>
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              {qrCode && <img src={qrCode} alt="2FA QR Code" style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }} />}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #888)', textAlign: 'center', wordBreak: 'break-all', marginBottom: 16 }}>
              Manual entry key: <code style={{ background: 'var(--bg-muted, #f3f4f6)', padding: '2px 6px', borderRadius: 4, fontSize: '0.85rem' }}>{manualSecret}</code>
            </p>
            <form onSubmit={handleVerify2FA}>
              <label className="field">
                <span>Verification Code</span>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                />
              </label>
              <div className="form-actions">
                <button type="button" className="refresh-btn" style={{ background: 'var(--bg-muted, #e5e7eb)', color: 'var(--text, #333)' }} onClick={() => { setTwoFAStep('idle'); setTwoFAError(''); }}>
                  Cancel
                </button>
                <button type="submit" className="refresh-btn" disabled={twoFASaving}>
                  {twoFASaving ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </div>
            </form>
          </div>
        ) : twoFAStep === 'backupCodes' ? (
          <div>
            <p style={{ color: 'var(--text-muted, #888)', marginBottom: 8 }}>
              <strong>Save your backup codes!</strong> Each code can only be used once. Store them in a safe place. You will not be able to see them again.
            </p>
            <div style={{ background: 'var(--bg-muted, #f3f4f6)', borderRadius: 8, padding: 16, margin: '12px 0', fontFamily: 'monospace', fontSize: '0.95rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {backupCodes.map((code, i) => (
                <span key={i}>{code}</span>
              ))}
            </div>
            <div className="form-actions">
              <button type="button" className="refresh-btn" onClick={handleClose2FABackup}>
                I have saved my backup codes
              </button>
            </div>
          </div>
        ) : twoFAStep === 'idle' && twoFAEnabled ? (
          <div>
            <p style={{ color: 'var(--text-muted, #888)', marginBottom: 12 }}>
              Two-factor authentication is currently enabled. To disable it, enter your password for confirmation.
            </p>
            <form onSubmit={handleDisable2FA}>
              <label className="field">
                <span>Confirm Password</span>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="refresh-btn" style={{ background: 'var(--red, #ef4444)', color: '#fff' }} disabled={twoFASaving}>
                  {twoFASaving ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      <div className="panel-card profile-card" style={{ maxWidth: 'none', marginTop: 16 }}>
        <div className="panel-card-header">
          <div className="icon-badge icon-badge-green">
            <MonitorSmartphone size={18} />
          </div>
          <div>
            <h3>Active Sessions</h3>
            <p>Devices currently signed in to your account</p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading sessions…" />
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--text-muted, #888)', padding: '8px 0' }}>No active sessions found.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device / Browser</th>
                  <th>Signed In</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.deviceInfo}</td>
                    <td>{fmtDate(s.createdAt)}</td>
                    <td>{fmtDate(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel-card profile-card" style={{ maxWidth: 'none', marginTop: 16 }}>
        <div className="panel-card-header">
          <div className="icon-badge icon-badge-red">
            <History size={18} />
          </div>
          <div>
            <h3>Login History</h3>
            <p>Recent sign-ins and security events on your account</p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading history…" />
        ) : history.length === 0 ? (
          <p style={{ color: 'var(--text-muted, #888)', padding: '8px 0' }}>No login history yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Details</th>
                  <th>IP Address</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h._id}>
                    <td>
                      <span className={`status-badge status-${h.action === 'LOGIN_FAILED' || h.action === 'ACCOUNT_LOCKED' ? 'paused' : 'active'}`}>
                        {ACTION_LABELS[h.action] || h.action}
                      </span>
                    </td>
                    <td>{h.details || '-'}</td>
                    <td className="mono">{h.ipAddress || '-'}</td>
                    <td>{fmtDate(h.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
