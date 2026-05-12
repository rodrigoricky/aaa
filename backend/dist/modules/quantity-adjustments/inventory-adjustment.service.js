"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustInventory = adjustInventory;
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const value_js_1 = require("../../shared/utils/value.js");
const inventory_adjustment_calculator_js_1 = require("./inventory-adjustment-calculator.js");
async function getLockedItemStock(transaction, itemcode) {
    const result = await transaction
        .request()
        .input('itemcode', sql_server_js_1.sql.NVarChar, itemcode)
        .query(`
      SELECT TOP 1
        itemcode,
        itemname,
        end_qty
      FROM items WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
      WHERE itemcode = @itemcode
    `);
    const row = result.recordset[0];
    if (!row) {
        throw (0, http_errors_js_1.unprocessable)(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
    }
    const lockedItemcode = (0, value_js_1.cleanString)(row.itemcode);
    return {
        itemcode: lockedItemcode,
        itemname: (0, value_js_1.cleanString)(row.itemname),
        currentStock: (0, value_js_1.parseRequiredQuantity)(row.end_qty, lockedItemcode),
    };
}
async function adjustInventory(transaction, input) {
    const item = await getLockedItemStock(transaction, input.itemcode);
    const calculation = (0, inventory_adjustment_calculator_js_1.calculateInventoryAdjustment)(item.currentStock, input.adjustmentQty, item.itemcode);
    const oldBalance = calculation.oldBalance;
    const adjustmentQty = calculation.adjustmentQty;
    const finalStock = calculation.finalStock;
    // Legacy POS compatibility:
    // Older POS pages read `balance` as current stock.
    // Therefore balance, new_qty, and end_qty must all store finalStock.
    // The previous stock is preserved separately in old_balance.
    const legacyBalance = finalStock;
    const legacyNewQty = finalStock;
    const legacyEndQty = finalStock;
    await transaction
        .request()
        .input('transDate', sql_server_js_1.sql.DateTime, input.transDate)
        .input('oldBalance', sql_server_js_1.sql.Decimal(18, 2), oldBalance)
        .input('qty', sql_server_js_1.sql.Decimal(18, 2), adjustmentQty)
        .input('userid', sql_server_js_1.sql.Char(10), input.legacyUserId)
        .input('posted', sql_server_js_1.sql.Numeric(18, 0), 1)
        .input('remarks', sql_server_js_1.sql.NVarChar, input.remarks?.slice(0, 50) ?? null)
        .input('endQty', sql_server_js_1.sql.Decimal(18, 2), legacyEndQty)
        .input('balance', sql_server_js_1.sql.Decimal(18, 2), legacyBalance)
        .input('newQty', sql_server_js_1.sql.Decimal(18, 2), legacyNewQty)
        .input('itemname', sql_server_js_1.sql.NVarChar, (0, value_js_1.cleanString)(input.itemname) || item.itemname)
        .input('machineId', sql_server_js_1.sql.NVarChar, 'UTILITY')
        .input('sync', sql_server_js_1.sql.TinyInt, 0)
        .input('batchNo', sql_server_js_1.sql.NVarChar, input.legacyBatchNo)
        .input('refNo', sql_server_js_1.sql.Char(10), input.legacyRefNo)
        .input('itemcode', sql_server_js_1.sql.NVarChar, item.itemcode)
        .query(`
      INSERT INTO inventory_adjustment (
        trans_date,
        old_balance,
        qty,
        userid,
        posted,
        remarks,
        end_qty,
        balance,
        new_qty,
        itemname,
        machine_id,
        sync,
        BATCH_NO,
        ref_no,
        itemcode
      )
      VALUES (
        @transDate,
        @oldBalance,
        @qty,
        @userid,
        @posted,
        @remarks,
        @endQty,
        @balance,
        @newQty,
        @itemname,
        @machineId,
        @sync,
        @batchNo,
        @refNo,
        @itemcode
      )
    `);
    const updateResult = await transaction
        .request()
        .input('itemcode', sql_server_js_1.sql.NVarChar, item.itemcode)
        .input('finalStock', sql_server_js_1.sql.Decimal(18, 2), finalStock)
        .input('adjustmentQty', sql_server_js_1.sql.Decimal(18, 2), adjustmentQty)
        .input('modifiedBy', sql_server_js_1.sql.NVarChar, input.modifiedBy)
        .query(`
      UPDATE items
      SET
        -- Legacy POS stock mirrors:
        -- Old POS screens read multiple item/delivery quantity columns.
        -- Keep these mirrors synchronized to finalStock after quantity adjustment.
        -- Update both ASSEMBLY_QTY and assembly_box as required legacy columns.
        end_qty = @finalStock,
        END_QTY_TEMP = @finalStock,
        ASSEMBLY_QTY = @finalStock,
        assembly_box = @finalStock,
        adjustment = ISNULL(adjustment, 0) + @adjustmentQty,
        modified_by = @modifiedBy,
        date_modified = GETDATE()
      WHERE itemcode = @itemcode
    `);
    if ((updateResult.rowsAffected[0] ?? 0) !== 1) {
        throw (0, http_errors_js_1.unprocessable)(`Unable to update inventory quantity for item ${item.itemcode}`);
    }
    await transaction
        .request()
        .input('itemcode', sql_server_js_1.sql.NVarChar, item.itemcode)
        .input('finalStock', sql_server_js_1.sql.Decimal(18, 2), finalStock)
        .query(`
      IF OBJECT_ID(N'dbo.delivery', N'U') IS NOT NULL
         AND COL_LENGTH(N'dbo.delivery', N'itemcode') IS NOT NULL
      BEGIN
        UPDATE dbo.delivery
        SET
          qty = @finalStock,
          qty2 = @finalStock
        WHERE itemcode = @itemcode;
      END
    `);
    return calculation;
}
