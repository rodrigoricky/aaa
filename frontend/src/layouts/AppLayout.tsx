import { Suspense, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import styles from './AppLayout.module.css';
import { useAuth } from '../hooks/useAuth';
import { getProfile } from '../services/auth.service';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/quantity-adjustments': 'Quantity Adjustment',
  '/quantity-adjustments/history': 'Saved Transactions',
  '/audit-logs': 'Audit Logs',
  '/users': 'Users',
};

function ContentSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonBar} style={{ width: '240px', height: '28px', marginBottom: '24px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
      <div className={styles.skeletonCard} style={{ height: '280px' }} />
    </div>
  );
}

const COLLAPSE_BREAKPOINT = 1024;

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= COLLAPSE_BREAKPOINT);
  const location = useLocation();
  const { isAuthenticated, setUser } = useAuth();

  const title = PAGE_TITLES[location.pathname] ?? 'G&P';

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const refresh = () => {
      getProfile()
        .then(setUser)
        .catch(() => {});
    };

    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [isAuthenticated, setUser]);

  return (
    <div className={styles.layout}>
      <Sidebar collapsed={collapsed} />
      <div className={styles.main}>
        <Header
          onToggleSidebar={() => setCollapsed((c) => !c)}
          sidebarCollapsed={collapsed}
          title={title}
        />
        <main className={styles.content}>
          <Suspense fallback={<ContentSkeleton />}>
            <div className={styles.pageWrapper}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
