import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Megaphone,
  Bell,
  SlidersHorizontal,
  FileBarChart,
  Settings,
  Shield,
  Users as UsersIcon,
  User,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  UsersRound,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/monitoring', label: 'Monitoring', icon: <Activity size={18} /> }, // Campaign monitoring
  { to: '/accounts', label: 'Accounts', icon: <Building2 size={18} /> },
  {
    label: 'Campaigns', icon: <Megaphone size={18} />,
    children: [
      { to: '/campaigns', label: 'Campaigns', icon: <Megaphone size={15} /> },
      { to: '/campaigns/google-ads', label: 'Google Ads', icon: <Activity size={15} /> },
      { to: '/campaigns/audience', label: 'Audience', icon: <UsersRound size={15} /> },
    ],
  },
  { to: '/alerts', label: 'Alerts', icon: <Bell size={18} /> },
  { to: '/rules', label: 'Rules', icon: <SlidersHorizontal size={18} /> },
  { to: '/reports', label: 'Reports', icon: <FileBarChart size={18} /> },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const [openSubmenu, setOpenSubmenu] = useState(null);

  // Settings (own Google Ads connection) and Security (2FA/sessions) are for
  // every user; Users is admin-only.
  const navItems = [
    ...BASE_NAV_ITEMS,
    { to: '/security', label: 'Security', icon: <Shield size={18} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
    ...(isAdmin ? [{ to: '/users', label: 'Users', icon: <UsersIcon size={18} /> }] : []),
    { to: '/profile', label: 'Profile', icon: <User size={18} /> },
  ];

  return (
    <>
      <aside className={`sidebar ${menuOpen ? 'menu-open' : ''}`}>
        <div className="sidebar-top-row">
          <div className="sidebar-brand">
            <div className="brand-mark">
              <Logo size={18} />
            </div>
            <h1>Google Ads Automation</h1>
          </div>
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            if (item.children) {
              const isOpen = openSubmenu === item.label;
              return (
                <div key={item.label} className="sidebar-group">
                  <button
                    className="sidebar-link sidebar-group-toggle"
                    onClick={() => setOpenSubmenu(isOpen ? null : item.label)}
                  >
                    {item.icon}
                    {item.label}
                    <span className="sidebar-chevron">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                  </button>
                  {isOpen && (
                    <div className="sidebar-sub">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.to === '/campaigns'}
                          onClick={() => setMenuOpen(false)}
                          className={({ isActive }) => `sidebar-link sidebar-sublink${isActive ? ' active' : ''}`}
                        >
                          {child.icon || <span style={{ width: 15 }} />}
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                {item.icon}
                {item.label}
              </NavLink>
            );
          })}
        </nav>

      </aside>
    </>
  );
}
