import type { Transaction } from 'mssql';
import { sql } from '../../shared/database/sql-server.js';
import { unprocessable } from '../../shared/errors/http-errors.js';
import { cleanString, parseRequiredQuantity } from '../../shared/utils/value.js';
import {
  calculateInventoryAdjustment,
  type InventoryAdjustmentCalculation,
} from './inventory-adjustment-calculator.js';

interface LockedItemStock {
  itemcode: string;
  itemname: string;
  currentStock: number;
}

interface AdjustInventoryInput {
  itemcode: string;
  itemname: string;
  adjustmentQty: number;
  transDate: Date;
  remarks: string | null;
  legacyUserId: string;
  legacyRefNo: string;
  legacyBatchNo: string;
  modifiedBy: string;
}

async function getLockedItemStock(
  transaction: Transaction,
  itemcode: string
): Promise<LockedItemStock> {
  const result = await transaction
    .request()
    .input('itemcode', sql.NVarChar, itemcode)
    .query(`
      SELECT TOP 1
        itemcode,
        itemname,
        end_qty
      FROM items WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
      WHERE itemcode = @itemcode
    `);

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw unprocessable(`Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`);
  }

  const lockedItemcode = cleanString(row.itemcode);
  return {
    itemcode: lockedItemcode,
    itemname: cleanString(row.itemname),
    currentStock: parseRequiredQuantity(row.end_qty, lockedItemcode),
  };
}

export async function adjustInventory(
  transaction: Transaction,
  input: AdjustInventoryInput
): Promise<InventoryAdjustmentCalculation> {
  const item = await getLockedItemStock(transaction, input.itemcode);
  const calculation = calculateInventoryAdjustment(
    item.currentStock,
    input.adjustmentQty,
    item.itemcode
  );

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
    .input('transDate', sql.DateTime, input.transDate)
    .input('oldBalance', sql.Decimal(18, 2), oldBalance)
    .input('qty', sql.Decimal(18, 2), adjustmentQty)
    .input('userid', sql.Char(10), input.legacyUserId)
    .input('posted', sql.Numeric(18, 0), 1)
    .input('remarks', sql.NVarChar, input.remarks?.slice(0, 50) ?? null)
    .input('endQty', sql.Decimal(18, 2), legacyEndQty)
    .input('balance', sql.Decimal(18, 2), legacyBalance)
    .input('newQty', sql.Decimal(18, 2), legacyNewQty)
    .input('itemname', sql.NVarChar, cleanString(input.itemname) || item.itemname)
    .input('machineId', sql.NVarChar, 'UTILITY')
    .input('sync', sql.TinyInt, 0)
    .input('batchNo', sql.NVarChar, input.legacyBatchNo)
    .input('refNo', sql.Char(10), input.legacyRefNo)
    .input('itemcode', sql.NVarChar, item.itemcode)
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
    .input('itemcode', sql.NVarChar, item.itemcode)
    .input('finalStock', sql.Decimal(18, 2), finalStock)
    .input('adjustmentQty', sql.Decimal(18, 2), adjustmentQty)
    .input('modifiedBy', sql.NVarChar, input.modifiedBy)
    .query(`
      UPDATE items
      SET
        end_qty = @finalStock,
        END_QTY_TEMP = @finalStock,
        ASSEMBLY_QTY = @finalStock,
        adjustment = ISNULL(adjustment, 0) + @adjustmentQty,
        modified_by = @modifiedBy,
        date_modified = GETDATE()
      WHERE itemcode = @itemcode
    `);

  if ((updateResult.rowsAffected[0] ?? 0) !== 1) {
    throw unprocessable(`Unable to update inventory quantity for item ${item.itemcode}`);
  }

  return calculation;
}
