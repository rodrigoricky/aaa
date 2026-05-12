import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateInventoryAdjustment,
  MAX_ABSOLUTE_ADJUSTMENT_QTY,
  normalizeAdjustmentQty,
} from '../modules/quantity-adjustments/inventory-adjustment-calculator.js';

test('calculates a positive inventory adjustment with final stock in balance fields', () => {
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
