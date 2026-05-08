import api from './api';

export type AdjustmentStatus = 'SAVED' | 'POSTED' | 'PENDING_CANCELLATION' | 'CANCELLED';
export type ReferenceType = 'DM' | 'CM';

export interface QuantityAdjustmentLine {
  id: string;
  lineNo: number;
  itemcode: string;
  itemname: string;
  oldQty: number;
  adjustQty: number;
  newQty: number;
  postedOldQty: number | null;
  postedNewQty: number | null;
  entryMode: 'DELTA' | 'SET' | null;
  requestedQty: number;
  itemRemark: string | null;
  updatedAt: string | null;
}

export interface QuantityAdjustmentDocument {
  id: string;
  qaNo: string;
  transDate: string;
  refType: ReferenceType;
  refNo: string;
  refSeriesNo: number;
  status: AdjustmentStatus;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  postedBy: string | null;
  postedAt: string | null;
  cancellationReason: string | null;
  cancellationRequestedBy: string | null;
  cancellationRequestedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  lines: QuantityAdjustmentLine[];
}

export interface QuantityAdjustmentListItem {
  id: string;
  qaNo: string;
  transDate: string;
  refType: ReferenceType;
  refNo: string;
  status: AdjustmentStatus;
  createdBy: string;
  createdAt: string;
  postedAt: string | null;
  cancellationReason?: string | null;
  cancellationRequestedBy?: string | null;
  cancellationRequestedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  lineCount: number;
}

export interface QuantityAdjustmentListResponse {
  data: QuantityAdjustmentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QuantityAdjustmentMeta {
  serverDate: string;
  nextQaNo: string;
  nextRefNumbers: {
    DM: string;
    CM: string;
  };
}

export interface QuantityAdjustmentLineInput {
  itemcode: string;
  entryMode: 'DELTA' | 'SET';
  requestedQty: number;
  itemRemark?: string;
}

export interface QuantityAdjustmentListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: AdjustmentStatus;
}

function buildSearchParams(
  filters: Record<string, string | number | undefined> | QuantityAdjustmentListFilters
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

export async function getQuantityAdjustmentMeta() {
  const res = await api.get<{ success: boolean; data: QuantityAdjustmentMeta }>(
    '/quantity-adjustments/meta'
  );
  return res.data.data;
}

export async function listQuantityAdjustments(
  filters: QuantityAdjustmentListFilters = {}
): Promise<QuantityAdjustmentListResponse> {
  const query = buildSearchParams(filters);
  const res = await api.get<{ success: boolean; data: QuantityAdjustmentListResponse }>(
    `/quantity-adjustments${query ? `?${query}` : ''}`
  );
  return res.data.data;
}

export async function getQuantityAdjustment(id: string) {
  const res = await api.get<{ success: boolean; data: QuantityAdjustmentDocument }>(
    `/quantity-adjustments/${id}`
  );
  return res.data.data;
}

export async function createQuantityAdjustment(input: {
  refType: ReferenceType;
  lines: QuantityAdjustmentLineInput[];
}) {
  const res = await api.post<{ success: boolean; data: QuantityAdjustmentDocument }>(
    '/quantity-adjustments',
    input
  );
  return res.data.data;
}

export async function updateQuantityAdjustment(
  id: string,
  input: { lines: QuantityAdjustmentLineInput[] }
) {
  const res = await api.patch<{ success: boolean; data: QuantityAdjustmentDocument }>(
    `/quantity-adjustments/${id}`,
    input
  );
  return res.data.data;
}

export async function postQuantityAdjustment(id: string) {
  const res = await api.post<{ success: boolean; data: QuantityAdjustmentDocument }>(
    `/quantity-adjustments/${id}/post`
  );
  return res.data.data;
}

export async function requestQuantityAdjustmentCancellation(id: string, reason: string) {
  const res = await api.post<{ success: boolean; data: QuantityAdjustmentDocument }>(
    `/quantity-adjustments/${id}/cancel`,
    { reason }
  );
  return res.data.data;
}

export async function getPrintableQuantityAdjustment(id: string) {
  const res = await api.get<{ success: boolean; data: QuantityAdjustmentDocument }>(
    `/quantity-adjustments/${id}/print`
  );
  return res.data.data;
}
