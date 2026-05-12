import { badRequest, unprocessable } from '../../shared/errors/http-errors.js';

export const MAX_ABSOLUTE_ADJUSTMENT_QTY = 999_999_999;

export interface InventoryAdjustmentCalculation {
  oldBalance: number;
  adjustmentQty: number;
  finalStock: number;
}

interface LegacyCompatibleAdjustmentInput {
  computedStockInput: unknown;
  desiredFinalStockInput: unknown;
  itemcode?: string;
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

export function normalizeDesiredFinalStock(value: unknown, itemcode = 'item') {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw badRequest(`Desired final stock is required for item ${itemcode}`);
  }

  const desiredFinalStock = Number(value);
  if (!Number.isFinite(desiredFinalStock)) {
    throw badRequest(`Desired final stock must be a valid number for item ${itemcode}`);
  }

  if (Math.abs(desiredFinalStock) > MAX_ABSOLUTE_ADJUSTMENT_QTY) {
    throw badRequest(`Desired final stock is too large for item ${itemcode}`);
  }

  return desiredFinalStock;
}

export function calculateLegacyCompatibleAdjustment(
  input: LegacyCompatibleAdjustmentInput
): InventoryAdjustmentCalculation {
  const itemcode = input.itemcode ?? 'item';
  const computedStock = Number(input.computedStockInput);
  if (!Number.isFinite(computedStock)) {
    throw unprocessable(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
  }

  const desiredFinalStock = normalizeDesiredFinalStock(input.desiredFinalStockInput, itemcode);
  const oldBalance = roundQuantity(computedStock);
  const finalStock = roundQuantity(desiredFinalStock);
  const adjustmentQty = roundQuantity(finalStock - oldBalance);

  if (!Number.isFinite(adjustmentQty) || !Number.isFinite(finalStock)) {
    throw badRequest(`Final stock quantity is invalid for item ${itemcode}`);
  }

  return {
    oldBalance,
    adjustmentQty,
    finalStock,
  };
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
