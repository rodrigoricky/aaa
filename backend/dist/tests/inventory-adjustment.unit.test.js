"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const inventory_adjustment_calculator_js_1 = require("../modules/quantity-adjustments/inventory-adjustment-calculator.js");
(0, node_test_1.default)('calculates a positive inventory adjustment with final stock in balance fields', () => {
    strict_1.default.deepEqual((0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(166, 50, '0000001'), {
        oldBalance: 166,
        adjustmentQty: 50,
        finalStock: 216,
    });
});
(0, node_test_1.default)('calculates a negative inventory adjustment', () => {
    strict_1.default.deepEqual((0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(216, -20, '0000001'), {
        oldBalance: 216,
        adjustmentQty: -20,
        finalStock: 196,
    });
});
(0, node_test_1.default)('allows a zero inventory adjustment without changing stock', () => {
    strict_1.default.deepEqual((0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(100, 0, '0000001'), {
        oldBalance: 100,
        adjustmentQty: 0,
        finalStock: 100,
    });
});
(0, node_test_1.default)('rejects invalid adjustment quantities', () => {
    strict_1.default.throws(() => (0, inventory_adjustment_calculator_js_1.normalizeAdjustmentQty)('', '0000001'), /required/);
    strict_1.default.throws(() => (0, inventory_adjustment_calculator_js_1.normalizeAdjustmentQty)('not-a-number', '0000001'), /valid number/);
    strict_1.default.throws(() => (0, inventory_adjustment_calculator_js_1.normalizeAdjustmentQty)(inventory_adjustment_calculator_js_1.MAX_ABSOLUTE_ADJUSTMENT_QTY + 1, '0000001'), /too large/);
    strict_1.default.throws(() => (0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(Number.NaN, 1, '0000001'), /no valid current quantity/);
});
