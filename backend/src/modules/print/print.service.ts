import type { AuthenticatedUser } from '../../shared/types/index.js';
import { getQuantityAdjustmentById, markQuantityAdjustmentPrinted } from '../quantity-adjustments/quantity-adjustments.service.js';

export async function getPrintableQuantityAdjustment(adjustmentId: string, actor: AuthenticatedUser) {
  await markQuantityAdjustmentPrinted(Number(adjustmentId), actor);
  return getQuantityAdjustmentById(adjustmentId);
}
