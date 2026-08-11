import { useEffect } from 'react';
import { settingsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// The OAuth proxy has used several names for the same value over time, and
// appends it to whatever return URL it was given. Accept any of them.
const TOKEN_KEYS = ['google_refresh_token', 'refresh_token', 'refreshToken', 'token'];

/**
 * Catches a refresh token handed back in the URL by the OAuth proxy.
 *
 * The proxy redirects to the return URL with the token appended, and it may
 * land in the query string or the fragment depending on the path taken — and
 * with a HashRouter the fragment also carries the route. Both are searched.
 *
 * Runs app-wide rather than on a dedicated callback route, because the proxy
 * decides where to drop the user and that is not always a route this app
 * controls.
 */
export default function GoogleTokenCatcher() {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) return;

    const { search, hash } = window.location;
    // With HashRouter the hash is "#/route?a=b"; take the part after "?".
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const params = new URLSearchParams(search.replace(/^\?/, ''));
    for (const [k, v] of new URLSearchParams(hashQuery)) params.set(k, v);

    const key = TOKEN_KEYS.find((k) => params.get(k));
    if (!key) return;

    const token = params.get(key);

    // Strip the token from the address bar before anything else, so it isn't
    // left sitting in history or copied out of the URL.
    const cleanHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?')) : hash;
    window.history.replaceState(null, '', `${window.location.pathname}${cleanHash || '#/settings'}`);

    settingsApi
      .saveToken({ refresh_token: token })
      .then(() => showToast('Google Ads connected successfully!'))
      .catch((err) => showToast(err.response?.data?.message || 'Failed to save the Google token', 'error'));
  }, [isAuthenticated]);

  return null;
}
