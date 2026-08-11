import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="app-shell app-shell-sidebar">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
