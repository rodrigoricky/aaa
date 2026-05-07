export type AdjustmentStatus = 'SAVED' | 'POSTED' | 'PENDING_CANCELLATION' | 'CANCELLED';
export type ReferenceType = 'DM' | 'CM';

export interface AdjustmentListItem {
  id: number;
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
