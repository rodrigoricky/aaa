import api from './api';

export interface DashboardStats {
  totalItems: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
  totalAdjustments: number;
  todayAdjustments: number;
  totalUsers: number;
}

export interface SalesTrendPoint {
  date: string;
  adjustments: number;
}

export interface RecentTransaction {
  id: string;
  qaNo: string;
  refType: string;
  refNo: string;
  status: string;
  createdBy: string;
  lineCount: number;
  createdAt: string;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await api.get<{ success: boolean; data: DashboardStats }>('/dashboard/stats');
  return res.data.data;
}

export async function getSalesTrend(): Promise<SalesTrendPoint[]> {
  const res = await api.get<{ success: boolean; data: SalesTrendPoint[] }>('/dashboard/sales-trend');
  return res.data.data;
}

export async function getRecentTransactions(): Promise<RecentTransaction[]> {
  const res = await api.get<{ success: boolean; data: RecentTransaction[] }>('/dashboard/recent-transactions');
  return res.data.data;
}
