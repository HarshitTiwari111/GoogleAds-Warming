import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Flame, Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Split-panel sign-in, carried over from the Warming-Farming project:
 * a branded gradient panel on the left, the form on the right. The branded
 * panel is hidden below 900px so the form gets the full width on mobile.
 *
 * The auth flow underneath is this app's own — AuthContext plus the
 * two-step 2FA challenge — not Warming-Farming's Redux store.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const tfaInputRef = useRef(null);

  const redirectTo = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password, needs2FA ? twoFactorToken : undefined);

      if (result?.requires2FA) {
        setNeeds2FA(true);
        setSubmitting(false);
        // Focus the 2FA input after render
        setTimeout(() => tfaInputRef.current?.focus(), 50);
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setNeeds2FA(false);
    setTwoFactorToken('');
    setError('');
  };

  return (
    <div className="auth-screen">
      <div className="auth-shell">
        {/* Left branded panel */}
        <aside className="auth-brand-panel">
          <span className="auth-blob auth-blob-1" />
          <span className="auth-blob auth-blob-2" />
          <span className="auth-blob auth-blob-3" />

          <div className="auth-brand-content">
            <div className="auth-brand-icon">
              <Flame size={40} />
            </div>
            <h1>Google Ads Automation</h1>
            <p>Account warming, campaign monitoring and alerting in one place</p>
            <div className="auth-brand-divider">
              <span />
              <em>Enterprise Dashboard</em>
              <span />
            </div>
          </div>
        </aside>

        {/* Right form panel */}
        <main className="auth-form-panel">
          <form className="auth-form" onSubmit={handleSubmit}>
            {/* Shown only when the branded panel is hidden (mobile). */}
            <div className="auth-mobile-mark">
              <Flame size={26} />
            </div>

            <header className="auth-form-head">
              <h2>{needs2FA ? 'Two-Factor Authentication' : 'Welcome back'}</h2>
              <p>
                {needs2FA
                  ? 'Enter the code from your authenticator app'
                  : 'Sign in to your account'}
              </p>
            </header>

            {error && <div className="error-banner">{error}</div>}

            {!needs2FA ? (
              <>
                <label className="auth-field">
                  <span className="auth-label">Email address</span>
                  <span className="auth-input-wrap">
                    <Mail className="auth-input-icon" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      autoFocus
                      required
                    />
                  </span>
                </label>

                <label className="auth-field">
                  <span className="auth-label">Password</span>
                  <span className="auth-input-wrap">
                    <Lock className="auth-input-icon" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="has-trailing-btn"
                      required
                    />
                    <button
                      type="button"
                      className="auth-input-btn"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
              </>
            ) : (
              <label className="auth-field">
                <span className="auth-label">Authentication Code</span>
                <span className="auth-input-wrap">
                  <ShieldCheck className="auth-input-icon" size={18} />
                  <input
                    ref={tfaInputRef}
                    type="text"
                    value={twoFactorToken}
                    onChange={(e) => setTwoFactorToken(e.target.value)}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    className="auth-code-input"
                    maxLength={8}
                    required
                  />
                </span>
                <span className="auth-hint">
                  Enter the 6-digit code from your authenticator app, or a backup code.
                </span>
              </label>
            )}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="auth-spinner" />
                  {needs2FA ? 'Verifying…' : 'Signing in…'}
                </>
              ) : needs2FA ? (
                'Verify'
              ) : (
                'Sign In'
              )}
            </button>

            {needs2FA ? (
              <button type="button" className="auth-link-btn" onClick={handleBack}>
                Back to login
              </button>
            ) : (
              <p className="auth-footer-note">Contact your administrator for account access</p>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
