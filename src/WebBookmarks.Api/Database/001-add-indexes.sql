-- Adds the indexes declared on the EF model (WebBookmarksContext.OnModelCreating)
-- to an existing database. Idempotent: safe to run repeatedly.
--
-- Usage (sqlcmd):
--   sqlcmd -S <server> -d <database> -i src/WebBookmarks.Api/Database/001-add-indexes.sql
-- or paste into Azure Data Studio / SSMS against the target DB.

-- Profile / BookmarkGroup map to nvarchar(max) by default, which cannot be an
-- index key. Bound them first (lengths match the API validation caps). Safe to
-- re-run; fails only if existing data exceeds these lengths (it shouldn't).
ALTER TABLE dbo.webbookmarkitems ALTER COLUMN Profile nvarchar(100) NULL;
ALTER TABLE dbo.webbookmarkitems ALTER COLUMN BookmarkGroup nvarchar(200) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_webbookmarkitems_Profile'
      AND object_id = OBJECT_ID('dbo.webbookmarkitems')
)
    CREATE INDEX IX_webbookmarkitems_Profile
        ON dbo.webbookmarkitems (Profile);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_webbookmarkitems_BookmarkGroup_SortOrder'
      AND object_id = OBJECT_ID('dbo.webbookmarkitems')
)
    CREATE INDEX IX_webbookmarkitems_BookmarkGroup_SortOrder
        ON dbo.webbookmarkitems (BookmarkGroup, SortOrder);
