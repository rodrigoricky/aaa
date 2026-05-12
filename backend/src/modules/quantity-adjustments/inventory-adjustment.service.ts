import type { Transaction } from 'mssql';
import { sql } from '../../shared/database/sql-server.js';
import { unprocessable } from '../../shared/errors/http-errors.js';
import { cleanString } from '../../shared/utils/value.js';
import {
  calculateLegacyCompatibleAdjustment,
  type InventoryAdjustmentCalculation,
} from './inventory-adjustment-calculator.js';

interface LockedItemStock {
  itemcode: string;
  itemname: string;
}

interface LegacyPosStockBreakdown {
  begQty: number;
  deliveryTotal: number;
  salesTotal: number;
  pulloutTotal: number;
  adjustmentTotal: number;
  computedStock: number;
}

interface AdjustInventoryInput {
  itemcode: string;
  itemname: string;
  desiredFinalStock: number;
  transDate: Date;
  remarks: string | null;
  legacyUserId: string;
  legacyRefNo: string;
  legacyBatchNo: string;
}

function toRoundedNumber(value: unknown, fieldName: string, itemcode: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw unprocessable(`Unable to compute ${fieldName} for item ${itemcode}. Please verify stock before saving/posting.`);
  }

  return Number(numeric.toFixed(2));
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
        itemname
      FROM items WITH (UPDLOCK, ROWLOCK)
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
  };
}

export async function computeLegacyPosStock(
  transaction: Transaction,
  itemcode: string
): Promise<LegacyPosStockBreakdown> {
  const result = await transaction
    .request()
    .input('itemcode', sql.NVarChar, itemcode)
    .query(`
      DECLARE @begQty DECIMAL(18, 2) = 0;
      DECLARE @deliveryTotal DECIMAL(18, 2) = 0;
      DECLARE @salesTotal DECIMAL(18, 2) = 0;
      DECLARE @pulloutTotal DECIMAL(18, 2) = 0;
      DECLARE @adjustmentTotal DECIMAL(18, 2) = 0;

      SELECT TOP 1
        @begQty = ISNULL(CONVERT(DECIMAL(18, 2), i.beg_qty), 0)
      FROM dbo.items i WITH (UPDLOCK, ROWLOCK)
      WHERE i.itemcode = @itemcode;

      SELECT
        @deliveryTotal = ISNULL(SUM(CONVERT(DECIMAL(18, 2), d.qty)), 0)
      FROM dbo.delivery d
      WHERE d.itemcode = @itemcode
        AND ISNULL(CONVERT(INT, d.posted), 0) = 1;

      SELECT
        @salesTotal = ISNULL(SUM(CONVERT(DECIMAL(18, 2), s.qty)), 0)
      FROM dbo.sales s
      WHERE s.itemcode = @itemcode
        AND ISNULL(CONVERT(INT, s.posted), 0) = 1;

      SELECT
        @pulloutTotal = ISNULL(SUM(CONVERT(DECIMAL(18, 2), p.qty)), 0)
      FROM dbo.pullout p
      WHERE p.itemcode = @itemcode
        AND ISNULL(CONVERT(INT, p.posted), 0) = 1;

      SELECT
        @adjustmentTotal = ISNULL(SUM(CONVERT(DECIMAL(18, 2), a.qty)), 0)
      FROM dbo.inventory_adjustment a
      WHERE a.itemcode = @itemcode
        AND ISNULL(CONVERT(INT, a.posted), 0) = 1;

      SELECT
        @begQty AS begQty,
        @deliveryTotal AS deliveryTotal,
        @salesTotal AS salesTotal,
        @pulloutTotal AS pulloutTotal,
        @adjustmentTotal AS adjustmentTotal,
        (@begQty + @deliveryTotal - @salesTotal - @pulloutTotal + @adjustmentTotal) AS computedStock;
    `);

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw unprocessable(`Unable to compute legacy POS stock for item ${itemcode}.`);
  }

  return {
    begQty: toRoundedNumber(row.begQty, 'beg_qty', itemcode),
    deliveryTotal: toRoundedNumber(row.deliveryTotal, 'delivery total', itemcode),
    salesTotal: toRoundedNumber(row.salesTotal, 'sales total', itemcode),
    pulloutTotal: toRoundedNumber(row.pulloutTotal, 'pullout total', itemcode),
    adjustmentTotal: toRoundedNumber(row.adjustmentTotal, 'adjustment total', itemcode),
    computedStock: toRoundedNumber(row.computedStock, 'computed stock', itemcode),
  };
}

export async function adjustInventory(
  transaction: Transaction,
  input: AdjustInventoryInput
): Promise<InventoryAdjustmentCalculation> {
  const item = await getLockedItemStock(transaction, input.itemcode);
  const legacyStock = await computeLegacyPosStock(transaction, item.itemcode);

  // Legacy POS compatibility:
  // The old POS recomputes items.end_qty from posted transaction tables
  // (sp_update_stock_inventory). Convert desired final stock to
  // inventory_adjustment.qty delta against the same ledger-based stock.
  const calculation = calculateLegacyCompatibleAdjustment({
    computedStockInput: legacyStock.computedStock,
    desiredFinalStockInput: input.desiredFinalStock,
    itemcode: item.itemcode,
  });

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
    .input(
      'remarks',
      sql.NVarChar,
      `${cleanString(input.remarks) || ''}${cleanString(input.remarks) ? ' | ' : ''}Final stock correction`
        .slice(0, 50)
    )
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
        assembly_box = @finalStock
      WHERE itemcode = @itemcode
    `);

  if ((updateResult.rowsAffected[0] ?? 0) !== 1) {
    throw unprocessable(`Unable to update inventory quantity for item ${item.itemcode}`);
  }

  await transaction
    .request()
    .input('itemcode', sql.NVarChar, item.itemcode)
    .input('finalStock', sql.Decimal(18, 2), finalStock)
    .query(`
      IF OBJECT_ID(N'dbo.delivery', N'U') IS NOT NULL
         AND COL_LENGTH(N'dbo.delivery', N'itemcode') IS NOT NULL
         AND COL_LENGTH(N'dbo.delivery', N'qty') IS NOT NULL
         AND COL_LENGTH(N'dbo.delivery', N'qty2') IS NOT NULL
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
