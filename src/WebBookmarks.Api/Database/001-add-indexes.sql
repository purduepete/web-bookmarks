-- Adds the indexes declared on the EF model (WebBookmarksContext.OnModelCreating)
-- to an existing database. Idempotent: safe to run repeatedly.
--
-- Usage (sqlcmd):
--   sqlcmd -S <server> -d <database> -i sql/001-add-indexes.sql
-- or paste into Azure Data Studio / SSMS against the target DB.

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
