-- Moves the webbookmarkitems table from the dbo schema into a dedicated `wb`
-- schema (dbo.webbookmarkitems -> wb.webbookmarkitems). Idempotent: safe to run
-- repeatedly. Indexes and default constraints move automatically with the table,
-- so no index rebuild is required.
--
-- Apply this to the target DB BEFORE deploying the code that references
-- wb.webbookmarkitems (EF ToTable, Program.cs startup index check, 001-add-indexes.sql).
--
-- Usage (sqlcmd):
--   sqlcmd -S <server> -d <database> -i src/WebBookmarks.Api/Database/002-move-schema-wb.sql
-- or paste into Azure Data Studio / SSMS against the target DB.

SET XACT_ABORT ON;

-- 1. Create the wb schema if it does not already exist. CREATE SCHEMA must be the
--    first statement in its batch, so run it via dynamic SQL.
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'wb')
    EXEC('CREATE SCHEMA wb;');
GO

-- 2. Transfer the table only while it is still in dbo (and not yet in wb).
IF OBJECT_ID('dbo.webbookmarkitems', 'U') IS NOT NULL
   AND OBJECT_ID('wb.webbookmarkitems', 'U') IS NULL
    ALTER SCHEMA wb TRANSFER dbo.webbookmarkitems;
GO
