import { Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useState, useRef, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';

const ROLE_LABELS = {
  admin: 'Admin',
  user: 'User',
};

export default function ProfileMenu() {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isDark = theme === 'dark';
  const displayName = user?.name || user?.email || '?';

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <>
      <div className="navbar-profile" ref={ref}>
        <button className="navbar-profile-btn" onClick={() => setOpen((o) => !o)}>
          <div className="navbar-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
          <ChevronDown size={14} className={`navbar-chevron ${open ? 'open' : ''}`} />
        </button>

        {open && (
          <div className="navbar-dropdown">
            <div className="navbar-dropdown-user">
              <div className="navbar-dropdown-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="navbar-dropdown-name">{displayName}</div>
                <div className="navbar-dropdown-role">{ROLE_LABELS[role] || role}</div>
              </div>
            </div>
            <div className="navbar-dropdown-divider" />
            <button className="navbar-dropdown-item" onClick={() => { toggleTheme(); setOpen(false); }}>
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              className="navbar-dropdown-item navbar-dropdown-logout"
              onClick={() => { setOpen(false); setShowLogoutConfirm(true); }}
            >
              <LogOut size={15} />
              Log out
            </button>
          </div>
        )}
      </div>
      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out?"
          message="Are you sure you want to log out?"
          confirmLabel="Log out"
          onConfirm={() => { setShowLogoutConfirm(false); logout(); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  );
}
