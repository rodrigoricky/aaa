import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLegacyCompatibleAdjustment,
  calculateInventoryAdjustment,
  MAX_ABSOLUTE_ADJUSTMENT_QTY,
  normalizeAdjustmentQty,
  normalizeDesiredFinalStock,
} from '../modules/quantity-adjustments/inventory-adjustment-calculator.js';

test('legacy-compatible adjustment from negative computed stock to desired final stock', () => {
  assert.deepEqual(
    calculateLegacyCompatibleAdjustment({
      computedStockInput: -175,
      desiredFinalStockInput: 1,
      itemcode: '0000001',
    }),
    {
      oldBalance: -175,
      adjustmentQty: 176,
      finalStock: 1,
    }
  );
});

test('legacy-compatible adjustment from positive computed stock to desired final stock', () => {
  assert.deepEqual(
    calculateLegacyCompatibleAdjustment({
      computedStockInput: 339,
      desiredFinalStockInput: 182,
      itemcode: '0000001',
    }),
    {
      oldBalance: 339,
      adjustmentQty: -157,
      finalStock: 182,
    }
  );
});

test('legacy recompute compatibility: computedBefore + savedDelta = desiredFinalStock', () => {
  const computedBefore = -175;
  const desiredFinalStock = 1;
  const calculation = calculateLegacyCompatibleAdjustment({
    computedStockInput: computedBefore,
    desiredFinalStockInput: desiredFinalStock,
    itemcode: '0000001',
  });

  assert.equal(calculation.adjustmentQty, 176);
  assert.equal(computedBefore + calculation.adjustmentQty, desiredFinalStock);
});

test('legacy-compatible adjustment does not use cached item mirror value', () => {
  assert.deepEqual(
    calculateLegacyCompatibleAdjustment({
      computedStockInput: -175,
      desiredFinalStockInput: 5,
      itemcode: '0000001',
    }),
    {
      oldBalance: -175,
      adjustmentQty: 180,
      finalStock: 5,
    }
  );
});

test('supports traditional delta calculation helper for draft preview', () => {
  assert.deepEqual(calculateInventoryAdjustment(166, 50, '0000001'), {
    oldBalance: 166,
    adjustmentQty: 50,
    finalStock: 216,
  });
});

test('calculates a negative inventory adjustment', () => {
  assert.deepEqual(calculateInventoryAdjustment(216, -20, '0000001'), {
    oldBalance: 216,
    adjustmentQty: -20,
    finalStock: 196,
  });
});

test('allows a zero inventory adjustment without changing stock', () => {
  assert.deepEqual(calculateInventoryAdjustment(100, 0, '0000001'), {
    oldBalance: 100,
    adjustmentQty: 0,
    finalStock: 100,
  });
});

test('rejects invalid adjustment quantities', () => {
  assert.throws(() => normalizeAdjustmentQty('', '0000001'), /required/);
  assert.throws(() => normalizeAdjustmentQty('not-a-number', '0000001'), /valid number/);
  assert.throws(
    () => normalizeAdjustmentQty(MAX_ABSOLUTE_ADJUSTMENT_QTY + 1, '0000001'),
    /too large/
  );
  assert.throws(() => calculateInventoryAdjustment(Number.NaN, 1, '0000001'), /no valid current quantity/);
});

test('rejects invalid desired final stock values', () => {
  assert.throws(() => normalizeDesiredFinalStock('', '0000001'), /required/);
  assert.throws(() => normalizeDesiredFinalStock('not-a-number', '0000001'), /valid number/);
  assert.throws(
    () => normalizeDesiredFinalStock(MAX_ABSOLUTE_ADJUSTMENT_QTY + 1, '0000001'),
    /too large/
  );
  assert.throws(
    () => calculateLegacyCompatibleAdjustment({
      computedStockInput: Number.NaN,
      desiredFinalStockInput: 1,
      itemcode: '0000001',
    }),
    /no valid current quantity/
  );
});
