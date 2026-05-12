"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNumber = toNumber;
exports.parseRequiredQuantity = parseRequiredQuantity;
exports.toIsoString = toIsoString;
exports.cleanString = cleanString;
const http_errors_js_1 = require("../errors/http-errors.js");
function toNumber(value, fallback = 0) {
    if (value == null)
        return fallback;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function parseRequiredQuantity(value, itemcode) {
    if (value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim() === '')) {
        throw (0, http_errors_js_1.unprocessable)(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
    }
    if (typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'bigint') {
        throw (0, http_errors_js_1.unprocessable)(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
    }
    const quantity = Number(value);
    if (!Number.isFinite(quantity)) {
        throw (0, http_errors_js_1.unprocessable)(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
    }
    return quantity;
}
function toIsoString(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
