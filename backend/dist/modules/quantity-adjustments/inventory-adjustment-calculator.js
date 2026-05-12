"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ABSOLUTE_ADJUSTMENT_QTY = void 0;
exports.normalizeAdjustmentQty = normalizeAdjustmentQty;
exports.calculateInventoryAdjustment = calculateInventoryAdjustment;
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
exports.MAX_ABSOLUTE_ADJUSTMENT_QTY = 999_999_999;
function roundQuantity(value) {
    return Number(value.toFixed(2));
}
function normalizeAdjustmentQty(value, itemcode = 'item') {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        throw (0, http_errors_js_1.badRequest)(`Adjustment quantity is required for item ${itemcode}`);
    }
    const adjustmentQty = Number(value);
    if (!Number.isFinite(adjustmentQty)) {
        throw (0, http_errors_js_1.badRequest)(`Adjustment quantity must be a valid number for item ${itemcode}`);
    }
    if (Math.abs(adjustmentQty) > exports.MAX_ABSOLUTE_ADJUSTMENT_QTY) {
        throw (0, http_errors_js_1.badRequest)(`Adjustment quantity is too large for item ${itemcode}`);
    }
    return adjustmentQty;
}
function calculateInventoryAdjustment(currentStockInput, adjustmentQtyInput, itemcode = 'item') {
    const currentStock = Number(currentStockInput);
    if (!Number.isFinite(currentStock)) {
        throw (0, http_errors_js_1.unprocessable)(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
    }
    const adjustmentQty = normalizeAdjustmentQty(adjustmentQtyInput, itemcode);
    const finalStock = roundQuantity(currentStock + adjustmentQty);
    if (!Number.isFinite(finalStock)) {
        throw (0, http_errors_js_1.badRequest)(`Final stock quantity is invalid for item ${itemcode}`);
    }
    return {
        oldBalance: roundQuantity(currentStock),
        adjustmentQty: roundQuantity(adjustmentQty),
        finalStock,
    };
}
