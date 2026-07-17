using Microsoft.EntityFrameworkCore;
using WebBookmarks.Api.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "WebBookmarks API",
        Version = "v1"
    });
});

builder.Services.AddDbContext<WebBookmarksContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("WebBookmarksDatabase");
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure());
});

// CORS. Allowed origins come from configuration ("Cors:AllowedOrigins"), so
// production owns its origin list via an App Service setting / IaC instead of
// relying on out-of-band platform CORS. Defaults to the Vite dev server.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
        if (origins is null || origins.Length == 0)
            origins = new[] { "http://localhost:5173" };
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// ── Ensure required indexes exist (self-healing) ────────────────────
// The list/group queries filter by Profile and order by (BookmarkGroup, SortOrder).
// These indexes are declared on the EF model, but the schema is managed out-of-band
// (schema.sql + Database/001-add-indexes.sql), so a DB can exist without them. This
// idempotent, guarded check creates them if missing on startup. It runs no DDL once
// they exist (only a metadata read) and never crashes the app if it can't apply them
// (e.g. the login lacks DDL rights, or the columns are still nvarchar(max) on a
// legacy DB — in which case the out-of-band script remains the documented path).
// CREATE INDEX uses ONLINE = ON so a first-time build never takes a schema-mod lock
// on the live table (per DB-change review).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<WebBookmarksContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await db.Database.ExecuteSqlRawAsync(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_webbookmarkitems_Profile' AND object_id = OBJECT_ID('wb.webbookmarkitems'))
    CREATE INDEX IX_webbookmarkitems_Profile ON wb.webbookmarkitems (Profile) WITH (ONLINE = ON);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_webbookmarkitems_BookmarkGroup_SortOrder' AND object_id = OBJECT_ID('wb.webbookmarkitems'))
    CREATE INDEX IX_webbookmarkitems_BookmarkGroup_SortOrder ON wb.webbookmarkitems (BookmarkGroup, SortOrder) WITH (ONLINE = ON);");
        logger.LogInformation("Index check complete: required indexes present.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not ensure indexes exist; continuing. Apply Database/001-add-indexes.sql manually if needed.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHttpsRedirection();
}

app.UseCors();

// ── API key authentication ──────────────────────────────────────────
// Enabled only when an "ApiKey" value is configured (env var / user secret /
// App Service setting). When unset, the API stays open (convenient for local dev).
var apiKey = app.Configuration["ApiKey"];

// Fail fast in non-development environments if no key is configured, so a
// misconfigured deploy can never go live as an open, unauthenticated API.
if (!app.Environment.IsDevelopment() && string.IsNullOrEmpty(apiKey))
{
    throw new InvalidOperationException(
        "ApiKey is not configured. Set the 'ApiKey' application setting " +
        "(App Service setting / Key Vault reference) before deploying to a non-development environment.");
}

app.Use(async (context, next) =>
{
    // Always let CORS preflight, Swagger, and the health probe through.
    if (HttpMethods.IsOptions(context.Request.Method) ||
        context.Request.Path.StartsWithSegments("/swagger") ||
        context.Request.Path.StartsWithSegments("/healthz"))
    {
        await next();
        return;
    }

    if (!string.IsNullOrEmpty(apiKey))
    {
        var provided = context.Request.Headers["X-Api-Key"].ToString();
        if (!KeysMatch(apiKey, provided))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Unauthorized" });
            return;
        }
    }

    await next();
});

// ── Health probe ────────────────────────────────────────────────────
// Liveness/readiness for App Service healthCheckPath and CI smoke tests.
// Verifies the process is up AND can reach the database; returns 503 if not,
// so a deploy that can't talk to SQL is reported unhealthy instead of 500ing
// on the first real request.
app.MapGet("/healthz", async (WebBookmarksContext db, CancellationToken ct) =>
{
    try
    {
        var canConnect = await db.Database.CanConnectAsync(ct);
        return canConnect
            ? Results.Ok(new { status = "healthy" })
            : Results.Json(new { status = "unhealthy", reason = "database unreachable" },
                statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "unhealthy", reason = ex.Message },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
})
    .WithName("HealthCheck")
    .WithOpenApi();

// ── Bookmark Endpoints ──────────────────────────────────────────────

// Upper bound on how many items a single bulk/reorder request may carry, so a
// malformed or hostile payload can't exhaust memory/DB resources.
const int MaxBulkItems = 1000;

app.MapGet("/api/bookmarks", async (bool? includeHidden, string? profile, WebBookmarksContext db, CancellationToken ct) =>
{
    // Read-only list: AsNoTracking() skips EF change-tracking/snapshotting, which
    // is pure overhead (memory + CPU) for a query whose results are never mutated
    // in this request. No pagination — the client is a start-page that renders all
    // groups at once with client-side search, so slicing would break the UX.
    var query = db.WebBookmarkItems.AsNoTracking();
    if (includeHidden != true)
        query = query.Where(b => b.IsVisible);
    if (!string.IsNullOrEmpty(profile))
        query = query.Where(b => b.Profile == profile || b.Profile == "all");
    return await query
        .OrderBy(b => b.BookmarkGroup)
        .ThenBy(b => b.SortOrder)
        .ToListAsync(ct);
})
    .WithName("GetBookmarks")
    .WithOpenApi();

app.MapGet("/api/bookmarks/{id:int}", async (int id, WebBookmarksContext db, CancellationToken ct) =>
    await db.WebBookmarkItems.FindAsync(new object?[] { id }, ct) is { } item
        ? Results.Ok(item)
        : Results.NotFound())
    .WithName("GetBookmark")
    .WithOpenApi();

app.MapPost("/api/bookmarks", async (WebBookmarksItem item, WebBookmarksContext db, CancellationToken ct) =>
{
    if (ValidateBookmark(item) is { } errors) return Results.ValidationProblem(errors);
    db.WebBookmarkItems.Add(item);
    await db.SaveChangesAsync(ct);
    return Results.Created($"/api/bookmarks/{item.Id}", item);
})
    .WithName("CreateBookmark")
    .WithOpenApi();

app.MapPut("/api/bookmarks/{id:int}", async (int id, WebBookmarksItem input, WebBookmarksContext db, CancellationToken ct) =>
{
    if (ValidateBookmark(input) is { } errors) return Results.ValidationProblem(errors);
    var item = await db.WebBookmarkItems.FindAsync(new object?[] { id }, ct);
    if (item is null) return Results.NotFound();

    item.Name = input.Name;
    item.Shortcut = input.Shortcut;
    item.Description = input.Description;
    item.URL = input.URL;
    item.URLs = input.URLs;
    item.IsVisible = input.IsVisible;
    item.BookmarkGroup = input.BookmarkGroup;
    item.SortOrder = input.SortOrder;
    item.Profile = input.Profile;
    item.IsFavorite = input.IsFavorite;

    // A concurrent delete between FindAsync and here makes EF's UPDATE affect 0
    // rows, throwing DbUpdateConcurrencyException. Treat it as a 404 rather than a
    // 500 — the row the client tried to update no longer exists.
    try
    {
        await db.SaveChangesAsync(ct);
    }
    catch (DbUpdateConcurrencyException)
    {
        return Results.NotFound();
    }
    return Results.NoContent();
})
    .WithName("UpdateBookmark")
    .WithOpenApi();

app.MapDelete("/api/bookmarks/{id:int}", async (int id, WebBookmarksContext db, CancellationToken ct) =>
{
    var item = await db.WebBookmarkItems.FindAsync(new object?[] { id }, ct);
    if (item is null) return Results.NotFound();

    db.WebBookmarkItems.Remove(item);
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
})
    .WithName("DeleteBookmark")
    .WithOpenApi();

app.MapGet("/api/bookmarks/check-alias", async (string alias, int? excludeId, WebBookmarksContext db, CancellationToken ct) =>
{
    var lower = alias.Trim().ToLower();
    var query = db.WebBookmarkItems.Where(b =>
        b.Shortcut != null && b.Shortcut != "" && (b.Shortcut.ToLower().Contains(lower) || lower.Contains(b.Shortcut.ToLower())));

    if (excludeId.HasValue)
        query = query.Where(b => b.Id != excludeId.Value);

    var matches = await query.Select(b => new { b.Id, b.Name, b.Shortcut }).ToListAsync(ct);
    return Results.Ok(new { isDuplicate = matches.Count > 0, matches });
})
    .WithName("CheckAlias")
    .WithOpenApi();

app.MapGet("/api/bookmarks/groups", async (string? profile, bool? exact, WebBookmarksContext db, CancellationToken ct) =>
{
    var query = db.WebBookmarkItems.Where(b => b.IsVisible);
    if (!string.IsNullOrEmpty(profile))
        query = exact == true
            ? query.Where(b => b.Profile == profile)
            : query.Where(b => b.Profile == profile || b.Profile == "all");
    return await query
        .Select(b => b.BookmarkGroup)
        .Distinct()
        .OrderBy(g => g)
        .ToListAsync(ct);
})
    .WithName("GetGroups")
    .WithOpenApi();

app.MapPost("/api/bookmarks/reorder", async (List<ReorderEntry> entries, WebBookmarksContext db, CancellationToken ct) =>
{
    if (entries.Count > MaxBulkItems) return Results.ValidationProblem(TooMany("entries"));
    var ids = entries.Select(e => e.Id).ToList();
    var items = await db.WebBookmarkItems
        .Where(b => ids.Contains(b.Id))
        .ToDictionaryAsync(b => b.Id, ct);
    foreach (var entry in entries)
        if (items.TryGetValue(entry.Id, out var item))
            item.SortOrder = entry.SortOrder;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
})
    .WithName("ReorderBookmarks")
    .WithOpenApi();

app.MapGet("/api/bookmarks/profiles", async (WebBookmarksContext db, CancellationToken ct) =>
    await db.WebBookmarkItems
        .Select(b => b.Profile)
        .Distinct()
        .OrderBy(p => p)
        .ToListAsync(ct))
    .WithName("GetProfiles")
    .WithOpenApi();

app.MapPost("/api/bookmarks/bulk", async (List<WebBookmarksItem> items, WebBookmarksContext db, CancellationToken ct) =>
{
    if (items.Count > MaxBulkItems) return Results.ValidationProblem(TooMany("items"));
    foreach (var item in items)
        if (ValidateBookmark(item) is { } errors)
            return Results.ValidationProblem(errors);
    db.WebBookmarkItems.AddRange(items);
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { imported = items.Count });
})
    .WithName("BulkCreateBookmarks")
    .WithOpenApi();

app.MapPut("/api/bookmarks/bulk", async (BulkUpdateRequest request, WebBookmarksContext db, CancellationToken ct) =>
{
    if (request.Ids is null || request.Ids.Count == 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["ids"] = new[] { "At least one id is required." } });
    if (request.Ids.Count > MaxBulkItems) return Results.ValidationProblem(TooMany("ids"));
    if (ValidateBulkUpdate(request) is { } errors) return Results.ValidationProblem(errors);
    var items = await db.WebBookmarkItems
        .Where(b => request.Ids.Contains(b.Id))
        .ToListAsync(ct);
    foreach (var item in items)
    {
        if (request.Profile is not null) item.Profile = request.Profile;
        if (request.BookmarkGroup is not null) item.BookmarkGroup = request.BookmarkGroup;
        if (request.Shortcut is not null) item.Shortcut = request.Shortcut;
        if (request.ClearShortcut == true) item.Shortcut = string.Empty;
        if (request.IsVisible is not null) item.IsVisible = request.IsVisible.Value;
        if (request.IsFavorite is not null) item.IsFavorite = request.IsFavorite.Value;
    }
    // If any of the loaded rows is deleted concurrently before save, EF throws
    // DbUpdateConcurrencyException. Return 409 Conflict so the client can reload
    // and retry, instead of surfacing an unhandled 500.
    try
    {
        await db.SaveChangesAsync(ct);
    }
    catch (DbUpdateConcurrencyException)
    {
        return Results.Conflict(new { error = "One or more bookmarks changed or were deleted concurrently. Reload and try again." });
    }
    return Results.Ok(new { updated = items.Count });
})
    .WithName("BulkUpdateBookmarks")
    .WithOpenApi();

app.MapPatch("/api/bookmarks/{id:int}/favorite", async (int id, WebBookmarksContext db, CancellationToken ct) =>
{
    // Flip the flag atomically at the database (SET IsFavorite = ~IsFavorite) so
    // concurrent toggles from multiple tabs each apply exactly once. The previous
    // load-negate-save could read the same value in two requests and write the
    // same result, silently losing a toggle.
    var affected = await db.WebBookmarkItems
        .Where(b => b.Id == id)
        .ExecuteUpdateAsync(s => s.SetProperty(b => b.IsFavorite, b => !b.IsFavorite), ct);
    if (affected == 0) return Results.NotFound();
    // Read back the resulting state to return the current truth to the client.
    // Project to a nullable so a concurrent delete between the update and this read
    // yields null (-> 404) rather than an unhandled InvalidOperationException (500).
    var isFavorite = await db.WebBookmarkItems
        .Where(b => b.Id == id)
        .Select(b => (bool?)b.IsFavorite)
        .FirstOrDefaultAsync(ct);
    if (isFavorite is null) return Results.NotFound();
    return Results.Ok(new { id, isFavorite = isFavorite.Value });
})
    .WithName("ToggleFavorite")
    .WithOpenApi();

app.MapPost("/api/bookmarks/bulk-delete", async (List<int> ids, WebBookmarksContext db, CancellationToken ct) =>
{
    if (ids.Count > MaxBulkItems) return Results.ValidationProblem(TooMany("ids"));
    var items = await db.WebBookmarkItems
        .Where(b => ids.Contains(b.Id))
        .ToListAsync(ct);
    db.WebBookmarkItems.RemoveRange(items);
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { deleted = items.Count });
})
    .WithName("BulkDeleteBookmarks")
    .WithOpenApi();

app.Run();

static bool KeysMatch(string expected, string provided)
{
    if (string.IsNullOrEmpty(provided)) return false;
    var a = System.Text.Encoding.UTF8.GetBytes(expected);
    var b = System.Text.Encoding.UTF8.GetBytes(provided);
    return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b);
}

// Validates and normalizes a bookmark payload. Returns null when valid, otherwise
// a field->messages map suitable for Results.ValidationProblem. Blocks dangerous
// URL schemes (javascript:, data:, etc.) so they can never be stored and later
// navigated to.
static Dictionary<string, string[]>? ValidateBookmark(WebBookmarksItem item)
{
    // Normalize the grouping fields so a null Profile/BookmarkGroup can't produce a
    // row that GetBookmarks (which filters Where(b => b.Profile == profile)) would
    // exclude — i.e. an orphaned, invisible bookmark. Clients always send a profile;
    // this is defense-in-depth for hand-crafted requests.
    item.Profile ??= "home";
    item.BookmarkGroup ??= "";

    var errors = new Dictionary<string, List<string>>();
    void Add(string field, string message)
    {
        if (!errors.TryGetValue(field, out var list)) errors[field] = list = new List<string>();
        list.Add(message);
    }

    if (string.IsNullOrWhiteSpace(item.Name)) Add("name", "Name is required.");
    else if (item.Name.Length > 200) Add("name", "Name must be 200 characters or fewer.");

    if (item.Shortcut is { Length: > 100 }) Add("shortcut", "Shortcut must be 100 characters or fewer.");
    if (item.Description is { Length: > 1000 }) Add("description", "Description must be 1000 characters or fewer.");
    if (item.BookmarkGroup is { Length: > 200 }) Add("bookmarkGroup", "Group must be 200 characters or fewer.");
    if (item.Profile is { Length: > 100 }) Add("profile", "Profile must be 100 characters or fewer.");
    if (item.URL is { Length: > 2048 }) Add("url", "URL must be 2048 characters or fewer.");
    if (item.URLs is { Length: > 4096 }) Add("urls", "URLs must be 4096 characters or fewer.");

    if (HasUnsafeScheme(item.URL)) Add("url", "URL uses a disallowed scheme.");
    if (HasUnsafeScheme(item.URLs)) Add("urls", "URL uses a disallowed scheme.");

    return errors.Count == 0 ? null : errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
}

static bool HasUnsafeScheme(string? value)
{
    if (string.IsNullOrWhiteSpace(value)) return false;
    // Browsers strip ASCII control chars (tab/newline/CR, etc.) from URLs before
    // parsing, so "java\tscript:" would execute as javascript. Remove control and
    // whitespace chars before the scheme check so such payloads can't slip past.
    var v = new string(value.Where(c => !char.IsControl(c) && !char.IsWhiteSpace(c)).ToArray())
        .ToLowerInvariant();
    string[] blockedSchemes = { "javascript:", "data:", "vbscript:" };
    return blockedSchemes.Any(scheme => v.StartsWith(scheme, StringComparison.Ordinal));
}

// Validates the mutable fields of a bulk update so the same length caps enforced
// on single create/update can't be bypassed via the bulk endpoint.
static Dictionary<string, string[]>? ValidateBulkUpdate(BulkUpdateRequest request)
{
    var errors = new Dictionary<string, string[]>();
    if (request.Shortcut is { Length: > 100 })
        errors["shortcut"] = new[] { "Shortcut must be 100 characters or fewer." };
    if (request.BookmarkGroup is { Length: > 200 })
        errors["bookmarkGroup"] = new[] { "Group must be 200 characters or fewer." };
    if (request.Profile is { Length: > 100 })
        errors["profile"] = new[] { "Profile must be 100 characters or fewer." };
    return errors.Count == 0 ? null : errors;
}

// Standard ValidationProblem payload for an over-sized bulk request.
static Dictionary<string, string[]> TooMany(string field) =>
    new() { [field] = new[] { $"Too many items in one request (max {1000})." } };

record ReorderEntry(int Id, int SortOrder);
record BulkUpdateRequest(List<int> Ids, string? Profile, string? BookmarkGroup, string? Shortcut, bool? IsVisible, bool? ClearShortcut, bool? IsFavorite);
