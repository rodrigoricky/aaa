import { badRequest, unprocessable } from '../../shared/errors/http-errors.js';

export const MAX_ABSOLUTE_ADJUSTMENT_QTY = 999_999_999;

export interface InventoryAdjustmentCalculation {
  oldBalance: number;
  adjustmentQty: number;
  finalStock: number;
}

function roundQuantity(value: number) {
  return Number(value.toFixed(2));
}

export function normalizeAdjustmentQty(value: unknown, itemcode = 'item') {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw badRequest(`Adjustment quantity is required for item ${itemcode}`);
  }

  const adjustmentQty = Number(value);
  if (!Number.isFinite(adjustmentQty)) {
    throw badRequest(`Adjustment quantity must be a valid number for item ${itemcode}`);
  }

  if (Math.abs(adjustmentQty) > MAX_ABSOLUTE_ADJUSTMENT_QTY) {
    throw badRequest(`Adjustment quantity is too large for item ${itemcode}`);
  }

  return adjustmentQty;
}

export function calculateInventoryAdjustment(
  currentStockInput: unknown,
  adjustmentQtyInput: unknown,
  itemcode = 'item'
): InventoryAdjustmentCalculation {
  const currentStock = Number(currentStockInput);
  if (!Number.isFinite(currentStock)) {
    throw unprocessable(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
  }

  const adjustmentQty = normalizeAdjustmentQty(adjustmentQtyInput, itemcode);
  const finalStock = roundQuantity(currentStock + adjustmentQty);
  if (!Number.isFinite(finalStock)) {
    throw badRequest(`Final stock quantity is invalid for item ${itemcode}`);
  }

  return {
    oldBalance: roundQuantity(currentStock),
    adjustmentQty: roundQuantity(adjustmentQty),
    finalStock,
  };
}
