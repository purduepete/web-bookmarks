using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Npgsql;
using NpgsqlTypes;

if (args.Length != 2)
    throw new ArgumentException("Usage: export|verify|import|compare <snapshot.json>");

var snapshotPath = Path.GetFullPath(args[1]);
switch (args[0])
{
    case "export": await ExportAsync(snapshotPath); break;
    case "verify": await VerifyAsync(snapshotPath); break;
    case "import": await ImportAsync(snapshotPath); break;
    case "compare": await CompareAsync(snapshotPath); break;
    default: throw new ArgumentException("Usage: export|verify|import|compare <snapshot.json>");
}

static async Task ExportAsync(string outputPath)
{
    var connectionString = "Server=tcp:sqlgkhw25ijhyzzy.database.windows.net,1433;Database=webportfolio;Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connect Timeout=30;";
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();

    var tables = new List<(string Schema, string Name)>();
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = """
            SELECT s.name, t.name
            FROM sys.tables AS t
            JOIN sys.schemas AS s ON s.schema_id=t.schema_id
            WHERE t.name=N'webbookmarkitems' AND s.name IN(N'wb',N'dbo')
            ORDER BY CASE WHEN s.name=N'wb' THEN 0 ELSE 1 END;
            """;
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) tables.Add((reader.GetString(0), reader.GetString(1)));
    }
    if (tables.Count != 1)
        throw new InvalidOperationException($"Expected exactly one WebBookmarks table in wb/dbo; found {tables.Count}.");
    var table = tables[0];

    var columns = new List<ColumnInfo>();
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = """
            SELECT c.name, TYPE_NAME(c.user_type_id), c.max_length, c.is_nullable, c.is_identity, dc.definition
            FROM sys.columns AS c
            JOIN sys.tables AS t ON c.object_id=t.object_id
            JOIN sys.schemas AS s ON t.schema_id=s.schema_id
            LEFT JOIN sys.default_constraints AS dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id
            WHERE s.name=@schema AND t.name=@table
            ORDER BY c.column_id;
            """;
        command.Parameters.AddWithValue("schema", table.Schema);
        command.Parameters.AddWithValue("table", table.Name);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columns.Add(new ColumnInfo(reader.GetString(0), reader.GetString(1), reader.GetInt16(2),
                reader.GetBoolean(3), reader.GetBoolean(4), reader.IsDBNull(5) ? null : reader.GetString(5)));
        }
    }
    ValidateColumns(columns);

    var quotedColumns = string.Join(", ", columns.Select(column => QuoteSqlServer(column.Name)));
    var rows = new List<object?[]>();
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = $"SELECT {quotedColumns} FROM {QuoteSqlServer(table.Schema)}.{QuoteSqlServer(table.Name)} ORDER BY [Id];";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var row = new object?[reader.FieldCount];
            for (var index = 0; index < row.Length; index++) row[index] = Normalize(reader.GetValue(index));
            rows.Add(row);
        }
    }
    var rowHashes = rows.Select(HashJson).ToArray();
    var snapshot = new SourceSnapshot("sqlgkhw25ijhyzzy.database.windows.net", "webportfolio", table.Schema, table.Name,
        DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture), columns, rows, rowHashes, HashText(string.Join("\n", rowHashes)));
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
    await File.WriteAllTextAsync(outputPath, JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine(JsonSerializer.Serialize(new { status = "Exported", table = $"{table.Schema}.{table.Name}", rows = rows.Count,
        columns = columns.Select(column => new { column.Name, column.SqlType, column.MaxLength, column.Nullable, column.Identity, column.DefaultDefinition }),
        snapshot.SnapshotSha256 }));
}

static async Task VerifyAsync(string path)
{
    var snapshot = await LoadSnapshotAsync(path);
    Console.WriteLine(JsonSerializer.Serialize(new { status = "Verified", rows = snapshot.Rows.Length,
        snapshotSha256 = snapshot.SnapshotSha256 }));
}

static async Task ImportAsync(string path)
{
    var snapshot = await LoadSnapshotAsync(path);
    var connectionString = GetTargetConnectionString();
    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();
    await using var transaction = await connection.BeginTransactionAsync();
    var existing = await CountRowsAsync(connection, transaction);
    if (existing != 0) throw new InvalidOperationException("The target table is not empty; refusing to import into existing data.");

    var names = string.Join(", ", snapshot.Columns.Select(column => QuotePostgres(column.Name)));
    var placeholders = string.Join(", ", snapshot.Columns.Select((_, index) => $"${index + 1}"));
    await using var command = new NpgsqlCommand($"INSERT INTO public.webbookmarkitems ({names}) VALUES ({placeholders});", connection, transaction);
    foreach (var column in snapshot.Columns)
        command.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = GetNpgsqlType(column.SqlType), Value = DBNull.Value });

    foreach (var row in snapshot.Rows)
    {
        for (var index = 0; index < row.Length; index++)
            command.Parameters[index].Value = FromJson(row[index], snapshot.Columns[index].SqlType) ?? DBNull.Value;
        await command.ExecuteNonQueryAsync();
    }
    await using (var sequence = new NpgsqlCommand("""
        SELECT setval(pg_get_serial_sequence('public.webbookmarkitems','Id'),
                      COALESCE(MAX("Id"), 1), COUNT(*) > 0)
        FROM public.webbookmarkitems;
        """, connection, transaction))
    {
        await sequence.ExecuteScalarAsync();
    }
    await transaction.CommitAsync();
    Console.WriteLine(JsonSerializer.Serialize(new { status = "Imported", rows = snapshot.Rows.Length, snapshot.SnapshotSha256 }));
}

static async Task CompareAsync(string path)
{
    var snapshot = await LoadSnapshotAsync(path);
    await using var connection = new NpgsqlConnection(GetTargetConnectionString());
    await connection.OpenAsync();
    var columns = string.Join(", ", snapshot.Columns.Select(column => QuotePostgres(column.Name)));
    var hashes = new List<string>();
    await using (var command = new NpgsqlCommand($"SELECT {columns} FROM public.webbookmarkitems ORDER BY \"Id\";", connection))
    await using (var reader = await command.ExecuteReaderAsync())
    {
        while (await reader.ReadAsync())
        {
            var row = new object?[reader.FieldCount];
            for (var index = 0; index < row.Length; index++) row[index] = Normalize(reader.GetValue(index));
            hashes.Add(HashJson(row));
        }
    }
    var targetHash = HashText(string.Join("\n", hashes));
    var matches = hashes.Count == snapshot.RowSha256.Length && hashes.SequenceEqual(snapshot.RowSha256, StringComparer.Ordinal);
    if (!matches || targetHash != snapshot.SnapshotSha256)
        throw new InvalidOperationException($"Row parity failed: source={snapshot.Rows.Length}, target={hashes.Count}.");
    Console.WriteLine(JsonSerializer.Serialize(new { status = "Compared", rows = hashes.Count,
        sourceSnapshotSha256 = snapshot.SnapshotSha256, targetSnapshotSha256 = targetHash, everyRowMatched = true }));
}

static async Task<LoadedSnapshot> LoadSnapshotAsync(string path)
{
    using var document = JsonDocument.Parse(await File.ReadAllTextAsync(path));
    var root = document.RootElement;
    if (root.GetProperty("SourceSchema").GetString() is not ("wb" or "dbo") || root.GetProperty("SourceTable").GetString() != "webbookmarkitems")
        throw new InvalidOperationException("Snapshot source table is outside the WebBookmarks allowlist.");
    var columns = root.GetProperty("Columns").Deserialize<ColumnInfo[]>() ?? throw new InvalidOperationException("Snapshot columns missing.");
    ValidateColumns(columns);
    var rows = root.GetProperty("Rows").EnumerateArray()
        .Select(row => row.EnumerateArray().Select(value => value.Clone()).ToArray()).ToArray();
    var rowHashes = root.GetProperty("RowSha256").EnumerateArray().Select(value => value.GetString()!).ToArray();
    var expected = root.GetProperty("SnapshotSha256").GetString()!;
    if (rows.Length != rowHashes.Length || !string.Equals(HashText(string.Join("\n", rowHashes)), expected, StringComparison.Ordinal))
        throw new InvalidOperationException("Snapshot integrity check failed.");
    for (var index = 0; index < rows.Length; index++)
    {
        if (rows[index].Length != columns.Length || HashJson(rows[index].Select((value, column) => FromJson(value, columns[column].SqlType)).ToArray()) != rowHashes[index])
            throw new InvalidOperationException($"Snapshot row {index} failed its hash check.");
    }
    return new LoadedSnapshot(columns, rows, rowHashes, expected);
}

static async Task<long> CountRowsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction)
{
    await using var command = new NpgsqlCommand("SELECT COUNT(*) FROM public.webbookmarkitems;", connection, transaction);
    return (long)(await command.ExecuteScalarAsync())!;
}

static string GetTargetConnectionString()
{
    var connectionString = Environment.GetEnvironmentVariable("WEBBOOKMARKS_MIGRATOR_CONNECTION");
    return string.IsNullOrWhiteSpace(connectionString)
        ? throw new InvalidOperationException("WEBBOOKMARKS_MIGRATOR_CONNECTION is not set.")
        : connectionString;
}

static void ValidateColumns(IReadOnlyList<ColumnInfo> columns)
{
    var allowed = new HashSet<string>(StringComparer.Ordinal) { "Id", "Name", "Shortcut", "Description", "URL", "URLs", "IsVisible", "BookmarkGroup", "SortOrder", "Profile", "IsFavorite" };
    if (columns.Count != allowed.Count || columns.Any(column => !allowed.Contains(column.Name)) || columns.Select(column => column.Name).Distinct(StringComparer.Ordinal).Count() != columns.Count)
        throw new InvalidOperationException("Source columns differ from the WebBookmarks model allowlist.");
}

static string QuoteSqlServer(string value) => $"[{value.Replace("]", "]]")}]";
static string QuotePostgres(string value) => $"\"{value.Replace("\"", "\"\"")}\"";
static string HashJson(object? value) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value))).ToLowerInvariant();
static string HashText(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

static object? Normalize(object? value) => value switch
{
    DBNull => null,
    DateTime dateTime => dateTime.ToString("O", CultureInfo.InvariantCulture),
    DateTimeOffset dateTimeOffset => dateTimeOffset.ToString("O", CultureInfo.InvariantCulture),
    _ => value
};

static NpgsqlDbType GetNpgsqlType(string sqlType) => sqlType.ToLowerInvariant() switch
{
    "int" => NpgsqlDbType.Integer,
    "bigint" => NpgsqlDbType.Bigint,
    "smallint" => NpgsqlDbType.Smallint,
    "tinyint" => NpgsqlDbType.Smallint,
    "bit" => NpgsqlDbType.Boolean,
    "nvarchar" or "varchar" or "nchar" or "char" or "text" => NpgsqlDbType.Text,
    "date" => NpgsqlDbType.Date,
    "datetime" or "smalldatetime" or "datetime2" => NpgsqlDbType.Timestamp,
    "datetimeoffset" => NpgsqlDbType.TimestampTz,
    "decimal" or "numeric" or "money" or "smallmoney" => NpgsqlDbType.Numeric,
    "float" or "real" => NpgsqlDbType.Double,
    "uniqueidentifier" => NpgsqlDbType.Uuid,
    "varbinary" or "binary" => NpgsqlDbType.Bytea,
    _ => throw new InvalidOperationException($"Unsupported source type: {sqlType}.")
};

static object? FromJson(JsonElement value, string sqlType)
{
    if (value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return null;
    return sqlType.ToLowerInvariant() switch
    {
        "int" => value.GetInt32(),
        "bigint" => value.GetInt64(),
        "smallint" => value.GetInt16(),
        "tinyint" => value.GetByte(),
        "bit" => value.GetBoolean(),
        "decimal" or "numeric" or "money" or "smallmoney" => value.GetDecimal(),
        "float" or "real" => value.GetDouble(),
        "date" => DateOnly.Parse(value.GetString()!, CultureInfo.InvariantCulture),
        "datetime" or "smalldatetime" or "datetime2" => DateTime.Parse(value.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
        "datetimeoffset" => DateTimeOffset.Parse(value.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
        "uniqueidentifier" => Guid.Parse(value.GetString()!),
        "varbinary" or "binary" => Convert.FromBase64String(value.GetString()!),
        _ => value.GetString()
    };
}

record ColumnInfo(string Name, string SqlType, int MaxLength, bool Nullable, bool Identity, string? DefaultDefinition);
record SourceSnapshot(string SourceServer, string SourceDatabase, string SourceSchema, string SourceTable, string ExportedLocal,
    IReadOnlyList<ColumnInfo> Columns, IReadOnlyList<object?[]> Rows, IReadOnlyList<string> RowSha256, string SnapshotSha256);
record LoadedSnapshot(ColumnInfo[] Columns, JsonElement[][] Rows, string[] RowSha256, string SnapshotSha256);
