-- ============================================================
-- POWERPOS INVENTORY AUTHORITY PATCH
-- File  : 105_patch_sp_update_stock_inventory_cloud.sql
-- Target: sp_update_stock_inventory_cloud
-- Executable: YES — uses T-SQL dynamic ALTER PROCEDURE
-- Prerequisites: 101_patch_sp_update_stock_inventory.sql first.
-- Safety: idempotent, no schema changes, no history deleted.
-- ============================================================

DECLARE @procName   NVARCHAR(128) = N'sp_update_stock_inventory_cloud';
DECLARE @patchMarker NVARCHAR(200) = N'POWERPOS INVENTORY AUTHORITY PATCH';
DECLARE @def        NVARCHAR(MAX);
DECLARE @patched    NVARCHAR(MAX);
DECLARE @patchBlock NVARCHAR(MAX);
DECLARE @revDef     NVARCHAR(MAX);
DECLARE @revPos     INT;
DECLARE @insertPos  INT;

SET @patchBlock = N'
  -- POWERPOS INVENTORY AUTHORITY PATCH: begin
  -- Restore authoritative UTILITY-adjusted stock after legacy recomputation.
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
