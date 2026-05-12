/*
  Inventory adjustment legacy compatibility migration.

  Before running in production:
  - Back up the database.
  - Count rows in inventory_adjustment.
  - Check NULLs/inconsistencies in balance, new_qty, end_qty, and qty.

  This adds old_balance for audit history. The legacy balance/new_qty/end_qty
  columns remain in place and will be written as final stock by the app.
*/

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'old_balance') IS NULL
BEGIN
  ALTER TABLE [dbo].[inventory_adjustment]
    ADD old_balance DECIMAL(18, 2) NULL;
END
GO

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'old_balance') IS NOT NULL
BEGIN
  UPDATE [dbo].[inventory_adjustment]
  SET old_balance =
    CASE
      WHEN new_qty IS NOT NULL AND qty IS NOT NULL THEN new_qty - qty
      WHEN end_qty IS NOT NULL AND qty IS NOT NULL THEN end_qty - qty
      ELSE ISNULL(balance, 0)
    END
  WHERE old_balance IS NULL;
END
GO

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'old_balance') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[inventory_adjustment]')
      AND name = N'old_balance'
      AND is_nullable = 1
  )
  BEGIN
    ALTER TABLE [dbo].[inventory_adjustment]
      ALTER COLUMN old_balance DECIMAL(18, 2) NOT NULL;
  END
END
GO

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
   AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'old_balance') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
      ON c.object_id = dc.parent_object_id
     AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'[dbo].[inventory_adjustment]')
      AND c.name = N'old_balance'
  )
  BEGIN
    ALTER TABLE [dbo].[inventory_adjustment]
      ADD CONSTRAINT DF_inventory_adjustment_old_balance
      DEFAULT (0) FOR old_balance;
  END
END
GO

IF OBJECT_ID(N'[dbo].[inventory_adjustment]', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'[dbo].[inventory_adjustment]', N'itemcode') IS NOT NULL
     AND COL_LENGTH(N'[dbo].[inventory_adjustment]', N'trans_date') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'[dbo].[inventory_adjustment]')
        AND name = N'IX_inventory_adjustment_itemcode_trans_date'
    )
  BEGIN
    CREATE INDEX IX_inventory_adjustment_itemcode_trans_date
      ON [dbo].[inventory_adjustment] (itemcode, trans_date);
  END
END
GO
