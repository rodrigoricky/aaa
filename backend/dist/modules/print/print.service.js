"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrintableQuantityAdjustment = getPrintableQuantityAdjustment;
const quantity_adjustments_service_js_1 = require("../quantity-adjustments/quantity-adjustments.service.js");
async function getPrintableQuantityAdjustment(adjustmentId, actor) {
    await (0, quantity_adjustments_service_js_1.markQuantityAdjustmentPrinted)(Number(adjustmentId), actor);
    return (0, quantity_adjustments_service_js_1.getQuantityAdjustmentById)(adjustmentId);
}
