import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  getDashboardStats,
  getSalesTrend,
  getRecentTransactions,
  type DashboardStats,
  type SalesTrendPoint,
  type RecentTransaction,
} from '../services/dashboard.service';
import Badge from '../components/ui/Badge';
import styles from './Dashboard.module.css';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiValue}>{value}</div>
        <div className={styles.kpiTitle}>{title}</div>
      </div>
    </div>
  );
}

function getStatusVariant(status: string): 'success' | 'warning' {
  return status === 'POSTED' ? 'success' : 'warning';
}

function getQaLabel(qaNo: string) {
  return qaNo || 'Pending';
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trend, setTrend] = useState<SalesTrendPoint[]>([]);
  const [adjustments, setAdjustments] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResult, trendResult, recentResult] = await Promise.all([
        getDashboardStats(),
        getSalesTrend(),
        getRecentTransactions(),
      ]);
      setStats(statsResult);
      setTrend(trendResult);
      setAdjustments(recentResult);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className={styles.page}>
      <div className={styles.kpiGrid}>
        <KpiCard
          title="Total Items"
          value={loading ? '—' : stats?.totalItems ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
        />
        <KpiCard
          title="Total Adjustments"
          value={loading ? '—' : stats?.totalAdjustments ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
            </svg>
          }
        />
        <KpiCard
          title="Today Adjustments"
          value={loading ? '—' : stats?.todayAdjustments ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <KpiCard
          title="Users"
          value={loading ? '—' : stats?.totalUsers ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
      </div>

      <div className={styles.chartSection}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Adjustment Trend (Last 7 Days)</h2>
          </div>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  formatter={(value: number) => [value, 'Adjustments']}
                  labelFormatter={(label) =>
                    new Date(label).toLocaleDateString('en-PH', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                  contentStyle={{
                    fontSize: 12,
                    border: '1px solid #e2e4e9',
                    borderRadius: 6,
                    boxShadow: 'none',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="adjustments"
                  stroke="#111827"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#111827', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Latest Adjustments</h2>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : adjustments.length === 0 ? (
          <div className={styles.empty}>No adjustments found</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>QA No.</th>
                  <th>Ref</th>
                  <th>Status</th>
                  <th>Lines</th>
                  <th>User</th>
                  <th>Date</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td className={styles.mono}>{getQaLabel(adjustment.qaNo)}</td>
                    <td>{adjustment.refType}-{adjustment.refNo}</td>
                    <td>
                      <Badge variant={getStatusVariant(adjustment.status)}>
                        {adjustment.status}
                      </Badge>
                    </td>
                    <td>{adjustment.lineCount}</td>
                    <td>{adjustment.createdBy}</td>
                    <td>{formatDate(adjustment.createdAt)}</td>
                    <td>{formatTime(adjustment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${styles.card} ${styles.statusSection}`}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Inventory Status</h2>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : (
          <div className={styles.statusGrid}>
            <div className={styles.statusCard}>
              <span className={styles.statusLabel}>In Stock</span>
              <strong className={styles.statusValue}>{stats?.inStockCount ?? 0}</strong>
              <span className={styles.statusHint}>Items above the low-stock threshold</span>
            </div>
            <div className={styles.statusCard}>
              <span className={styles.statusLabel}>Low Stock</span>
              <strong className={styles.statusValue}>{stats?.lowStockCount ?? 0}</strong>
              <span className={styles.statusHint}>Items at or below their low-stock threshold</span>
            </div>
            <div className={styles.statusCard}>
              <span className={styles.statusLabel}>Out of Stock</span>
              <strong className={styles.statusValue}>{stats?.outOfStockCount ?? 0}</strong>
              <span className={styles.statusHint}>Items with zero or negative stock</span>
            </div>
            <div className={styles.statusCard}>
              <span className={styles.statusLabel}>Negative Stock</span>
              <strong className={styles.statusValue}>{stats?.negativeStockCount ?? 0}</strong>
              <span className={styles.statusHint}>Items currently below zero</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
