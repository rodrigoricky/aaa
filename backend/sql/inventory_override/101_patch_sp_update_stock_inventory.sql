-- ============================================================
-- POWERPOS INVENTORY AUTHORITY PATCH
-- File  : 101_patch_sp_update_stock_inventory.sql
-- Target: sp_update_stock_inventory
-- Purpose:
--   1. Create a performance index to make the UTILITY-authority
--      check fast even when inventory_adjustment has many rows.
--   2. Create sp_apply_utility_inventory_override — a reusable
--      procedure that re-applies the authoritative end_qty for
--      every item that has a latest posted UTILITY adjustment.
--      Call this procedure immediately after sp_update_stock_inventory
--      in any EOD / inventory-procedure workflow until step 3 below
--      is applied.
--   3. Template showing the escape-hatch block to INSERT inside
--      sp_update_stock_inventory, before its final write of
--      END_QTY_TEMP / end_qty, so the override happens inline.
--
-- Safety:
--   • No existing procedures are dropped or disabled.
--   • No schema columns are added or removed.
--   • No transaction history rows are deleted.
--   • All original calculations (qty_in, qty_out, adjustments,
--     transfers, pullout) continue to run as before.
--   • The override only activates when machine_id = 'UTILITY'
--     AND posted = 1 exists for an item.
-- ============================================================

-- ============================================================
-- STEP 1 — PERFORMANCE INDEX (safe to run on live system)
-- ============================================================

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'itemcode') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'machine_id') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'trans_date') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'posted') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM sys.indexes
     WHERE object_id = OBJECT_ID(N'[dbo].[inventory_adjustment]')
       AND name = N'IX_inventory_adjustment_utility_authority'
   )
BEGIN
  CREATE INDEX IX_inventory_adjustment_utility_authority
    ON [dbo].[inventory_adjustment] (itemcode, machine_id, trans_date DESC)
    INCLUDE (end_qty, posted)
    WHERE machine_id = 'UTILITY';
END
GO

-- ============================================================
-- STEP 2 — STANDALONE OVERRIDE PROCEDURE (runnable, safe)
-- ============================================================
-- This procedure is the authoritative-override safety net.
-- It corrects items table stock values after any legacy procedure
-- has run and may have overwritten UTILITY-authoritative stock.
--
-- Intended use in EOD / inventory workflows:
--   EXEC dbo.sp_update_stock_inventory;
--   EXEC dbo.sp_apply_utility_inventory_override;
-- ============================================================

CREATE OR ALTER PROCEDURE [dbo].[sp_apply_utility_inventory_override]
AS
BEGIN
  -- POWERPOS INVENTORY AUTHORITY PATCH
  SET NOCOUNT ON;

  -- For every item whose latest POSTED inventory_adjustment was created
  -- by machine_id = 'UTILITY', restore the authoritative end_qty to all
  -- four live stock columns so the old POS cannot revert the stock.
  UPDATE i
  SET
    i.end_qty       = qa.authoritative_end_qty,
    i.END_QTY_TEMP  = qa.authoritative_end_qty,
    i.ASSEMBLY_QTY  = qa.authoritative_end_qty,
    i.assembly_box  = qa.authoritative_end_qty
  FROM dbo.items i
  INNER JOIN (
    SELECT
      itemcode,
      CONVERT(DECIMAL(18, 2), end_qty) AS authoritative_end_qty
    FROM (
      SELECT
        itemcode,
        end_qty,
        ROW_NUMBER() OVER (
          PARTITION BY itemcode
          ORDER BY trans_date DESC
        ) AS rn
      FROM dbo.inventory_adjustment
      WHERE machine_id = 'UTILITY'
        AND ISNULL(CONVERT(INT, posted), 0) = 1
    ) ranked
    WHERE rn = 1
  ) qa ON qa.itemcode = i.itemcode
  WHERE
    ABS(ISNULL(CONVERT(DECIMAL(18, 2), i.end_qty),      0) - qa.authoritative_end_qty) > 0.001
    OR ABS(ISNULL(CONVERT(DECIMAL(18, 2), i.END_QTY_TEMP), 0) - qa.authoritative_end_qty) > 0.001
    OR ABS(ISNULL(CONVERT(DECIMAL(18, 2), i.ASSEMBLY_QTY),  0) - qa.authoritative_end_qty) > 0.001
    OR ABS(ISNULL(CONVERT(DECIMAL(18, 2), i.assembly_box),  0) - qa.authoritative_end_qty) > 0.001;
END
GO

-- ============================================================
-- STEP 3 — INLINE PATCH TEMPLATE FOR sp_update_stock_inventory
-- ============================================================
-- Apply the block below INSIDE sp_update_stock_inventory, in the
-- cursor loop that iterates over items, BEFORE the statement that
-- writes END_QTY_TEMP (or end_qty / assembly columns).
--
-- The resulting ALTER PROCEDURE must contain the text
-- "POWERPOS INVENTORY AUTHORITY PATCH" so the verification
-- script can confirm the patch is active.
--
-- ---- INSERT THIS BLOCK BEFORE THE FINAL STOCK UPDATE -------
/*

  -- POWERPOS INVENTORY AUTHORITY PATCH: begin
  -- Check whether this item has a UTILITY-posted adjustment.
  -- If so, use its end_qty as the authoritative final stock instead
  -- of the value recalculated from the ledger formula.
  DECLARE @qaEndQty DECIMAL(18, 2);

  SELECT TOP 1
    @qaEndQty = CONVERT(DECIMAL(18, 2), ia.end_qty)
  FROM dbo.inventory_adjustment ia
  WHERE ia.itemcode   = @currentItemCode   -- replace with your loop variable
    AND ia.machine_id = 'UTILITY'
    AND ISNULL(CONVERT(INT, ia.posted), 0) = 1
  ORDER BY ia.trans_date DESC, ia.id DESC;

  IF @qaEndQty IS NOT NULL
  BEGIN
    -- Use authoritative utility stock; skip legacy formula overwrite.
    SET @END_QTY_TEMP = @qaEndQty;
    -- Also keep the other mirror columns consistent.
    -- (Adjust variable names to match your actual procedure.)
    -- SET @endQtyOut   = @qaEndQty;
    -- SET @assemblyQty = @qaEndQty;
  END
  -- POWERPOS INVENTORY AUTHORITY PATCH: end

*/
-- ---- END OF TEMPLATE BLOCK ---------------------------------
GO
