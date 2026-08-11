import { useEffect, useState } from 'react';
import { User, Lock, MessageCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { usersApi, authApi, rulesApi, unwrap } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [alertForm, setAlertForm] = useState({ telegramChatId: '', telegramBotToken: '' });
  const [mutedRuleTypes, setMutedRuleTypes] = useState([]);
  const [savingAlerts, setSavingAlerts] = useState(false);

  const [nameForm, setNameForm] = useState({ name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    Promise.all([usersApi.me(), rulesApi.list()])
      .then(([meRes, rulesRes]) => {
        const me = unwrap(meRes);
        setProfile(me);
        setAlertForm({
          telegramChatId: me.telegramChatId || '',
          telegramBotToken: me.telegramBotToken || '',
        });
        setMutedRuleTypes(me.mutedRuleTypes || []);
        setNameForm({ name: me.name || '', email: me.email || '' });
        setRules(unwrap(rulesRes) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const handleAlertChange = (field) => (e) => setAlertForm((f) => ({ ...f, [field]: e.target.value }));

  const toggleMuteRule = (ruleType) => {
    setMutedRuleTypes((prev) => (prev.includes(ruleType) ? prev.filter((r) => r !== ruleType) : [...prev, ruleType]));
  };

  const handleSaveAlerts = async (e) => {
    e.preventDefault();
    setSavingAlerts(true);
    try {
      const res = await usersApi.updateMe({ ...alertForm, mutedRuleTypes });
      setProfile(unwrap(res));
      showToast('Alert preferences saved');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save alert preferences', 'error');
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleNameChange = (field) => (e) => setNameForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile(nameForm);
      const updated = unwrap(res) || res;
      updateUser(updated);
      showToast('Profile updated');
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = (field) => (e) => setPasswordForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      showToast('Password changed');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingSpinner label="Loading profile…" fullHeight />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Profile" subtitle="Your account, alert preferences & security" />

      {error && (
        <div className="error-banner">
          Could not load profile. ({error.message})
        </div>
      )}

      <div className="panel-grid">
        <div className="panel-card profile-card">
          <div className="panel-card-header">
            <div className="icon-badge icon-badge-indigo">
              <User size={18} />
            </div>
            <div>
              <h3>Account</h3>
              <p>Your identity on this workspace</p>
            </div>
          </div>

          <div className="profile-info">
            <div className="metric">
              <span className="metric-label">Name</span>
              <span className="metric-value">{profile?.name || user?.name}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Email</span>
              <span className="metric-value">{profile?.email || user?.email}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Role</span>
              <span className="metric-value">{profile?.role || user?.role}</span>
            </div>
          </div>

          {profileError && <div className="error-banner">{profileError}</div>}
          <form onSubmit={handleSaveProfile}>
            <div className="form-row">
              <label className="field">
                <span>Name</span>
                <input type="text" value={nameForm.name} onChange={handleNameChange('name')} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={nameForm.email} onChange={handleNameChange('email')} required />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="refresh-btn" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        <div className="panel-card profile-card">
          <div className="panel-card-header">
            <div className="icon-badge icon-badge-red">
              <Lock size={18} />
            </div>
            <div>
              <h3>Security</h3>
              <p>Change your account password</p>
            </div>
          </div>

          {passwordError && <div className="error-banner">{passwordError}</div>}
          <form onSubmit={handleSavePassword}>
            <label className="field">
              <span>Current Password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange('currentPassword')}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="form-row">
              <label className="field">
                <span>New Password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange('newPassword')}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="field">
                <span>Confirm New Password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange('confirmPassword')}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="refresh-btn" disabled={savingPassword}>
                {savingPassword ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel-card profile-card" style={{ maxWidth: 'none', marginTop: 16 }}>
        <div className="panel-card-header">
          <div className="icon-badge icon-badge-green">
            <MessageCircle size={18} />
          </div>
          <div>
            <h3>Alert Delivery</h3>
            <p>Where your Telegram alerts get sent, and which ones you want</p>
          </div>
        </div>

        <form onSubmit={handleSaveAlerts}>
          <div className="form-row">
            <label className="field">
              <span>Telegram Chat ID</span>
              <input
                type="text"
                value={alertForm.telegramChatId}
                onChange={handleAlertChange('telegramChatId')}
                placeholder="Your Telegram chat ID"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Telegram Bot Token</span>
              <input
                type="text"
                value={alertForm.telegramBotToken}
                onChange={handleAlertChange('telegramBotToken')}
                placeholder="Your Telegram bot token"
                autoComplete="off"
              />
            </label>
          </div>

          {rules.length > 0 && (
            <div className="mute-rules">
              <span className="mute-rules-label">Mute Alert Types</span>
              {rules.map((rule) => (
                <div className="mute-rule-row" key={rule._id}>
                  <span>{rule.name || rule.type}</span>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={!mutedRuleTypes.includes(rule.type)}
                      onChange={() => toggleMuteRule(rule.type)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
              <p className="rule-description">Toggle off to mute alerts for that rule type.</p>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="refresh-btn" disabled={savingAlerts}>
              {savingAlerts ? 'Saving…' : 'Save Alert Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
