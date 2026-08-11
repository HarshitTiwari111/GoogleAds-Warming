import ProfileMenu from './ProfileMenu';

export default function PageHeader({ title, subtitle, lastUpdated, onRefresh, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="header-actions">
        {lastUpdated && (
          <span className="last-updated">
            <span className="live-dot" />
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        {actions}
        {onRefresh && (
          <button className="refresh-btn" onClick={onRefresh}>
            Refresh
          </button>
        )}
        <ProfileMenu />
      </div>
    </header>
  );
}
