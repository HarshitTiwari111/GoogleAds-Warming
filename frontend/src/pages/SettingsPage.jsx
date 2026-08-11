import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import GoogleLogo from '../components/GoogleLogo';
import { settingsApi, unwrap } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const MCC_ID_LENGTH = 10;

/**
 * Each user's own Google Ads connection, plus the MCC list new accounts are
 * provisioned under. Layout carried over from the Warming-Farming project.
 *
 * MCC order is meaningful — account creation walks the list top-down and uses
 * the first manager account that accepts the new client.
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [mccIds, setMccIds] = useState([]);
  const [newMccId, setNewMccId] = useState('');
  const [savingMcc, setSavingMcc] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [manualToken, setManualToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const checkConnection = () => {
    setLoading(true);
    return settingsApi
      .get()
      .then((res) => {
        const data = unwrap(res) || {};
        setConnected(!!(data.isConnected || data.hasRefreshToken));
        setMccIds(data.mccIds || []);
        setLastSync(data.lastSync || null);
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  };

  const loadAllUsers = () => {
    if (!isAdmin) return Promise.resolve();
    setLoadingUsers(true);
    return settingsApi
      .usersStatus()
      .then((res) => setAllUsers(unwrap(res) || []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  };

  // The OAuth proxy drops the refresh token here on its way back.
  useEffect(() => {
    const pendingToken = sessionStorage.getItem('pending_google_token');
    if (!pendingToken) return;
    sessionStorage.removeItem('pending_google_token');
    settingsApi
      .saveToken({ refresh_token: pendingToken })
      .then(() => {
        showToast('Google Ads account connected successfully!');
        navigate('/');
      })
      .catch(() => showToast('Failed to save token', 'error'));
  }, []);

  // The direct Google flow redirects back here with the outcome in the query
  // string, since the token exchange already happened server-side.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const oauthError = params.get('oauth_error');
    const connectedFlag = params.get('connected');
    if (!oauthError && !connectedFlag) return;

    if (oauthError) showToast(oauthError, 'error');
    else {
      showToast('Google Ads account connected successfully!');
      checkConnection();
    }
    // Clear the params so a refresh doesn't replay the same toast.
    window.history.replaceState(null, '', `${window.location.pathname}#/settings`);
  }, []);

  const handleSaveManualToken = async (e) => {
    e.preventDefault();
    setSavingToken(true);
    try {
      await settingsApi.saveToken({ refresh_token: manualToken.trim() });
      showToast('Refresh token saved — Google Ads connected');
      setManualToken('');
      setShowManual(false);
      checkConnection();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save the token', 'error');
    } finally {
      setSavingToken(false);
    }
  };

  useEffect(() => {
    checkConnection();
    loadAllUsers();
  }, [isAdmin]);

  const persistMccIds = async (updated, message) => {
    setSavingMcc(true);
    try {
      const res = await settingsApi.updateMccIds(updated);
      setMccIds((unwrap(res) || {}).mccIds || updated);
      showToast(message);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save MCC list', 'error');
    } finally {
      setSavingMcc(false);
    }
  };

  const handleAddMcc = (e) => {
    e.preventDefault();
    const id = newMccId.trim();
    if (id.length !== MCC_ID_LENGTH) {
      showToast(`MCC ID must be ${MCC_ID_LENGTH} digits`, 'error');
      return;
    }
    if (mccIds.includes(id)) {
      showToast('MCC ID already added', 'error');
      return;
    }
    setNewMccId('');
    persistMccIds([...mccIds, id], 'MCC ID added');
  };

  const handleRemoveMcc = (id) => persistMccIds(mccIds.filter((m) => m !== id), 'MCC ID removed');

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await settingsApi.getOAuthUrl();
      const { url } = unwrap(res) || res;
      if (url) window.location.href = url;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to get OAuth URL', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await settingsApi.update({ disconnect: true });
      setConnected(false);
      setLastSync(null);
      showToast('Google Ads disconnected');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to disconnect', 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Google Ads API connection" />

      <div className="panel-card set-card">
        <h2 className="set-heading">Google Ads API Connection</h2>

        <div className="set-box">
          <h3>How it works</h3>
          <ol className="set-steps">
            <li>Click &quot;Connect with Google&quot; below.</li>
            <li>Sign in with the Gmail account that has access to your Google Ads manager account.</li>
            <li>Grant permission — you&apos;ll be redirected back automatically.</li>
            <li>Add your MCC ID(s) and click &quot;Sync&quot; on the Accounts page.</li>
          </ol>
        </div>

        {loading ? (
          <div className="set-status set-status-idle">
            <RefreshCw size={20} className="set-spin" />
            <span>Checking connection status…</span>
          </div>
        ) : connected ? (
          <div className="set-status set-status-ok">
            <CheckCircle size={24} />
            <div>
              <p className="set-status-title">Connected</p>
              <p className="set-status-sub">
                Your Google Ads account is linked.
                {lastSync && <span className="set-status-meta">Last sync: {new Date(lastSync).toLocaleString()}</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="set-status set-status-warn">
            <AlertTriangle size={24} />
            <div>
              <p className="set-status-title">Not Connected</p>
              <p className="set-status-sub">
                {isAdmin
                  ? 'As an admin you already see every user’s synced data. Connect only to sync your own accounts.'
                  : 'Connect your Google Ads account to get started.'}
              </p>
            </div>
          </div>
        )}

        <div className="set-box">
          <h3>MCC (Manager Account) IDs</h3>

          {mccIds.length > 0 && (
            <div className="set-mcc-list">
              {mccIds.map((id, i) => (
                <div key={id} className="set-mcc-row">
                  <span className="set-mcc-id">{id}</span>
                  {i === 0 && mccIds.length > 1 && <span className="set-mcc-tag">preferred</span>}
                  <button
                    type="button"
                    className="set-mcc-remove"
                    onClick={() => handleRemoveMcc(id)}
                    disabled={savingMcc}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form className="set-mcc-add" onSubmit={handleAddMcc}>
            <input
              type="text"
              value={newMccId}
              // Google Ads shows ids hyphenated; the API only takes digits.
              onChange={(e) => setNewMccId(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 8331500921"
              maxLength={MCC_ID_LENGTH}
              inputMode="numeric"
            />
            <button type="submit" className="btn-primary" disabled={savingMcc || newMccId.length !== MCC_ID_LENGTH}>
              {savingMcc ? 'Saving…' : 'Add MCC ID'}
            </button>
          </form>

          <p className="set-hint">Add your Google Ads Manager Account IDs ({MCC_ID_LENGTH} digits each).</p>
        </div>

        <div className="set-actions">
          <button type="button" className="btn-primary set-google-btn" onClick={handleConnect} disabled={connecting}>
            <GoogleLogo size={16} />
            {connecting ? 'Connecting…' : connected ? 'Reconnect with Google' : 'Connect with Google'}
          </button>
          {connected && (
            <button type="button" className="set-disconnect-btn" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}

          <button type="button" className="set-refresh-link" onClick={() => setShowManual((s) => !s)}>
            {showManual ? 'Hide' : 'Paste a refresh token instead'}
          </button>
        </div>

        {/* Escape hatch for when the browser flow can't be used — e.g. the
            shared OAuth proxy hasn't allowlisted this domain and no own
            OAuth client is configured yet. */}
        {showManual && (
          <form className="set-box" style={{ marginTop: 16 }} onSubmit={handleSaveManualToken}>
            <h3>Connect with an existing refresh token</h3>
            <p className="set-hint" style={{ margin: '0 0 12px' }}>
              Generate one at developers.google.com/oauthplayground for the scope{' '}
              <code>https://www.googleapis.com/auth/adwords</code>, then paste it here.
            </p>
            <div className="set-mcc-add">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="1//0g..."
                autoComplete="off"
              />
              <button type="submit" className="btn-primary" disabled={savingToken || !manualToken.trim()}>
                {savingToken ? 'Saving…' : 'Save Token'}
              </button>
            </div>
          </form>
        )}
      </div>

      {isAdmin && (
        <div className="panel-card set-card">
          <div className="set-card-head">
            <h2 className="set-heading">All Users – Google Ads Status</h2>
            <button type="button" className="set-refresh-link" onClick={loadAllUsers} disabled={loadingUsers}>
              <RefreshCw size={14} className={loadingUsers ? 'set-spin' : undefined} /> Refresh
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Google Ads</th>
                  <th>MCC IDs</th>
                  <th>Synced Accounts</th>
                  <th>Last Sync</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.length === 0 ? (
                  <tr>
                    <td className="empty-row" colSpan={6}>No users found.</td>
                  </tr>
                ) : (
                  allUsers.map((u) => (
                    <tr key={u.userId}>
                      <td>
                        <div className="set-user-name">{u.name}</div>
                        <div className="cell-sub">{u.email}</div>
                      </td>
                      <td>
                        <span className={`pill ${u.role === 'admin' ? 'pill-success' : 'pill-neutral'}`}>{u.role}</span>
                      </td>
                      <td>
                        {u.connected ? (
                          <span className="set-connected-cell">
                            <CheckCircle size={14} /> Connected
                          </span>
                        ) : (
                          <span className="cell-muted">Not connected</span>
                        )}
                      </td>
                      <td>
                        {u.mccId ? (
                          <span className="set-mcc-chip">{u.mccId}</span>
                        ) : (
                          <span className="cell-muted">-</span>
                        )}
                      </td>
                      <td>{u.syncedAccounts}</td>
                      <td className="cell-muted">
                        {u.lastSynced ? new Date(u.lastSynced).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
