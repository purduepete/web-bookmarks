-- Adds the indexes declared on the EF model (WebBookmarksContext.OnModelCreating)
-- to an existing database. Idempotent: safe to run repeatedly.
--
-- NOTE: The API now also self-heals these indexes on startup (create-if-missing,
-- ONLINE) — see Program.cs. This script is still the fallback for a legacy DB whose
-- Profile/BookmarkGroup columns are still nvarchar(max) (which can't be indexed until
-- bounded), since the startup check intentionally does not ALTER columns.
--
-- Usage (sqlcmd):
--   sqlcmd -S <server> -d <database> -i src/WebBookmarks.Api/Database/001-add-indexes.sql
-- or paste into Azure Data Studio / SSMS against the target DB.

SET XACT_ABORT ON;

-- 1. Drop any DEFAULT constraints on Profile / BookmarkGroup. Their names are
--    auto-generated (e.g. DF__webbookma__Profi__5B638405) and differ per DB, so
--    find them dynamically. They block ALTER COLUMN (SQL error 4922/5074).
DECLARE @drop nvarchar(max) = N'';
SELECT @drop = @drop + 'ALTER TABLE wb.webbookmarkitems DROP CONSTRAINT ' + QUOTENAME(dc.name) + ';'
FROM sys.default_constraints dc
JOIN sys.columns c
    ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('wb.webbookmarkitems')
  AND c.name IN ('Profile', 'BookmarkGroup');
IF @drop <> N'' EXEC sp_executesql @drop;

-- 2. Bound the columns. nvarchar(max) cannot be an index key (SQL error 1919).
--    Lengths match the API validation caps.
ALTER TABLE wb.webbookmarkitems ALTER COLUMN Profile nvarchar(100) NULL;
ALTER TABLE wb.webbookmarkitems ALTER COLUMN BookmarkGroup nvarchar(200) NULL;

-- 3. Restore the empty-string defaults so insert behavior is unchanged.
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_webbookmarkitems_Profile')
    ALTER TABLE wb.webbookmarkitems
        ADD CONSTRAINT DF_webbookmarkitems_Profile DEFAULT '' FOR Profile;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_webbookmarkitems_BookmarkGroup')
    ALTER TABLE wb.webbookmarkitems
        ADD CONSTRAINT DF_webbookmarkitems_BookmarkGroup DEFAULT '' FOR BookmarkGroup;
GO

-- 4. Create the indexes.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_webbookmarkitems_Profile'
      AND object_id = OBJECT_ID('wb.webbookmarkitems')
)
    CREATE INDEX IX_webbookmarkitems_Profile
        ON wb.webbookmarkitems (Profile);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_webbookmarkitems_BookmarkGroup_SortOrder'
      AND object_id = OBJECT_ID('wb.webbookmarkitems')
)
    CREATE INDEX IX_webbookmarkitems_BookmarkGroup_SortOrder
        ON wb.webbookmarkitems (BookmarkGroup, SortOrder);
