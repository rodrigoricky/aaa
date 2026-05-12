-- ============================================================
-- POWERPOS INVENTORY AUTHORITY PATCH
-- File  : 103_patch_sp_update_assembly.sql
-- Target: sp_update_assembly
-- Executable: YES — uses T-SQL dynamic ALTER PROCEDURE
-- Purpose:
--   sp_update_assembly propagates:
--     END_QTY_TEMP → ASSEMBLY_QTY → end_qty → assembly_box
--
--   This patch appends EXEC dbo.sp_apply_utility_inventory_override
--   before the procedure's final END so the authoritative UTILITY
--   stock is restored after the assembly propagation runs.
--
-- Prerequisites: 101_patch_sp_update_stock_inventory.sql first.
-- Safety: idempotent, no schema changes, no history deleted.
-- ============================================================

DECLARE @procName   NVARCHAR(128) = N'sp_update_assembly';
DECLARE @patchMarker NVARCHAR(200) = N'POWERPOS INVENTORY AUTHORITY PATCH';
DECLARE @def        NVARCHAR(MAX);
DECLARE @patched    NVARCHAR(MAX);
DECLARE @patchBlock NVARCHAR(MAX);
DECLARE @revDef     NVARCHAR(MAX);
DECLARE @revPos     INT;
DECLARE @insertPos  INT;

SET @patchBlock = N'
  -- POWERPOS INVENTORY AUTHORITY PATCH: begin
  -- Restore authoritative UTILITY-adjusted stock after assembly propagation.
  IF OBJECT_ID(N''dbo.sp_apply_utility_inventory_override'', N''P'') IS NOT NULL
  BEGIN
    EXEC dbo.sp_apply_utility_inventory_override;
  END;
  -- POWERPOS INVENTORY AUTHORITY PATCH: end
';

SELECT @def = sm.definition
FROM sys.sql_modules sm
INNER JOIN sys.objects o ON o.object_id = sm.object_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name = @procName
  AND s.name  = N'dbo'
  AND o.type  = N'P';

IF @def IS NULL
BEGIN
  PRINT N'[SKIP] ' + @procName + N' does not exist in dbo schema.';
END
ELSE IF @def LIKE N'%' + @patchMarker + N'%'
BEGIN
  PRINT N'[SKIP] ' + @procName + N' is already patched.';
END
ELSE
BEGIN
  IF PATINDEX(N'%CREATE PROCEDURE%', @def) > 0
    SET @def = STUFF(@def, PATINDEX(N'%CREATE PROCEDURE%', @def), 16, N'CREATE OR ALTER PROCEDURE');
  ELSE IF PATINDEX(N'%CREATE PROC %', @def) > 0
    SET @def = STUFF(@def, PATINDEX(N'%CREATE PROC %', @def), 12, N'CREATE OR ALTER PROCEDURE ');

  SET @revDef = REVERSE(@def);
  SET @revPos = PATINDEX(N'%' + N'DNE' + CHAR(10) + N'%', @revDef);
  IF @revPos > 0
  BEGIN
    SET @insertPos = LEN(@def) - @revPos - 2;
    SET @patched = LEFT(@def, @insertPos) + @patchBlock + SUBSTRING(@def, @insertPos + 1, LEN(@def));
  END
  ELSE
  BEGIN
    SET @revPos = PATINDEX(N'%' + N'DNE' + CHAR(13) + CHAR(10) + N'%', @revDef);
    IF @revPos > 0
    BEGIN
      SET @insertPos = LEN(@def) - @revPos - 3;
      SET @patched = LEFT(@def, @insertPos) + @patchBlock + SUBSTRING(@def, @insertPos + 1, LEN(@def));
    END
    ELSE
      SET @patched = @def + CHAR(10) + @patchBlock;
  END
  EXEC sp_executesql @patched;
  PRINT N'[PATCHED] ' + @procName + N' patched successfully.';
END
GO

-- ============================================================
-- Until the inline patch below is applied, add the following
-- call to your EOD / inventory workflow after this procedure:
--
--   EXEC dbo.sp_update_assembly;
--   EXEC dbo.sp_apply_utility_inventory_override;
--
-- sp_apply_utility_inventory_override was created in file 101.
-- ============================================================

-- ============================================================
-- STEP 2 — INLINE PATCH TEMPLATE FOR sp_update_assembly
-- ============================================================
-- Apply the block below INSIDE sp_update_assembly.
-- Insert it at the START of each item's processing block,
-- BEFORE sp_update_assembly computes its propagation values.
-- If the procedure uses a cursor loop over items, insert at the
-- top of the loop body.  If it operates as a set-based UPDATE,
-- add a WHERE NOT EXISTS (... UTILITY adjustment ...) guard to
-- that UPDATE statement instead.
--
-- The resulting ALTER PROCEDURE must contain the text
-- "POWERPOS INVENTORY AUTHORITY PATCH".
--
-- ---- CURSOR-LOOP PATTERN (insert at top of loop body) ------
/*

  -- POWERPOS INVENTORY AUTHORITY PATCH: begin
  -- If this item has a UTILITY-authoritative adjustment, all four
  -- stock columns must stay fixed; skip the assembly propagation.
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
    -- Force all four mirror columns to the authoritative value and
    -- skip the rest of the assembly-propagation logic for this item.
    UPDATE dbo.items
    SET
      end_qty      = @qaEndQty,
      END_QTY_TEMP = @qaEndQty,
      ASSEMBLY_QTY = @qaEndQty,
      assembly_box = @qaEndQty
    WHERE itemcode = @currentItemCode;

    CONTINUE;  -- jump to next cursor iteration
    -- (replace CONTINUE with GOTO nextItem if the procedure uses GOTO)
  END
  -- POWERPOS INVENTORY AUTHORITY PATCH: end

*/
-- ---- SET-BASED UPDATE PATTERN (add guard to the UPDATE) -----
/*

  -- Add to the UPDATE statement's WHERE clause:
  --
  --   AND NOT EXISTS (
  --     SELECT 1
  --     FROM dbo.inventory_adjustment ia
  --     WHERE ia.itemcode   = i.itemcode       -- 'i' = alias for dbo.items
  --       AND ia.machine_id = 'UTILITY'
  --       AND ISNULL(CONVERT(INT, ia.posted), 0) = 1
  --   )
  --
  -- Then add a SECOND UPDATE after it to fix the UTILITY items:
  --
  --   -- POWERPOS INVENTORY AUTHORITY PATCH: begin
  --   UPDATE i
  --   SET
  --     i.end_qty      = qa.authoritative_end_qty,
  --     i.END_QTY_TEMP = qa.authoritative_end_qty,
  --     i.ASSEMBLY_QTY = qa.authoritative_end_qty,
  --     i.assembly_box = qa.authoritative_end_qty
  --   FROM dbo.items i
  --   INNER JOIN (
  --     SELECT itemcode,
  --            CONVERT(DECIMAL(18,2), end_qty) AS authoritative_end_qty
  --     FROM (
  --       SELECT itemcode, end_qty,
  --              ROW_NUMBER() OVER (PARTITION BY itemcode
  --                                 ORDER BY trans_date DESC) AS rn
  --       FROM dbo.inventory_adjustment
  --       WHERE machine_id = 'UTILITY'
  --         AND ISNULL(CONVERT(INT, posted), 0) = 1
  --     ) ranked
  --     WHERE rn = 1
  --   ) qa ON qa.itemcode = i.itemcode;
  --   -- POWERPOS INVENTORY AUTHORITY PATCH: end

*/
-- ---- END OF TEMPLATE BLOCK ---------------------------------
GO
