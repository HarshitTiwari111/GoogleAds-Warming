import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, getToken, setToken, clearToken, unwrap } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token is already stored, re-validate it against the
  // backend (GET /auth/me) instead of blindly trusting a cached user object -
  // this way a revoked/expired token gets cleared immediately rather than
  // showing a stale session that fails on the first real request.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((res) => setUser(unwrap(res)))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password, twoFactorToken) => {
    const res = await authApi.login(email, password, twoFactorToken);
    const data = unwrap(res) || res;

    // 2FA challenge - password was correct but a TOTP code is needed
    if (data.requires2FA) {
      return { requires2FA: true };
    }

    const { token, user: loggedInUser } = data;
    setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // No self-registration: accounts are created by an admin from the Users page.

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Server-side logout failed (network error, token already expired, etc.)
      // - proceed with local cleanup regardless.
    }
    clearToken();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const role = user?.role || null;

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    role,
    isAdmin: role === 'admin',
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
