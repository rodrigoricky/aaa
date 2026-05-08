import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/auth.service';
import type { RoleName } from '../store/authStore';
import styles from './Sidebar.module.css';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  allowedRoles?: RoleName[];
  requiredPermission?:
    | 'dashboardRead'
    | 'inventoryRead'
    | 'adjustmentPageAccess'
    | 'auditRead'
    | 'usersRead'
    | 'permissionsRead';
}

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

function IconAdjustments() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: <IconDashboard />, requiredPermission: 'dashboardRead' },
  { path: '/inventory', label: 'Inventory', icon: <IconBox />, requiredPermission: 'inventoryRead' },
  { path: '/quantity-adjustments', label: 'Quantity Adjustment', icon: <IconAdjustments />, requiredPermission: 'adjustmentPageAccess' },
  { path: '/quantity-adjustments/history', label: 'Saved Transactions', icon: <IconClipboard />, requiredPermission: 'adjustmentPageAccess' },
  { path: '/audit-logs', label: 'Audit Logs', icon: <IconClipboard />, requiredPermission: 'auditRead' },
  { path: '/users', label: 'Users', icon: <IconUsers />, requiredPermission: 'usersRead' },
  { path: '/permissions', label: 'Permissions', icon: <IconShield />, requiredPermission: 'permissionsRead' },
  { path: '/settings/qa-numbering', label: 'QA Numbering', icon: <IconHash />, allowedRoles: ['Admin'] },
];

interface SidebarProps {
  collapsed: boolean;
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const { user, clearUser, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearUser();
      navigate('/login');
    }
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.requiredPermission || hasPermission(item.requiredPermission)) &&
      (!item.allowedRoles || (user ? item.allowedRoles.includes(user.role) : false))
  );

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? 'US';

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <img src="/Logo.png" alt="G&P logo" style={{ width: '24px', height: '24px' }} />
        </div>
        <span className={styles.logoText}>G&amp;P </span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav} aria-label="Sidebar navigation">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={styles.footer}>
        {user && (
          <div className={styles.userInfo} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              className={styles.userAvatar}
              title={collapsed ? user.username : undefined}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{user.username}</div>
              <div className={styles.userRole}>{user.role?.replace('_', ' ')}</div>
            </div>
          </div>
        )}
        <button
          className={styles.logoutBtn}
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          aria-label="Logout"
        >
          <span className={styles.navIcon}><IconLogout /></span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
