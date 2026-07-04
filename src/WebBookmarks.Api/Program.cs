using Microsoft.EntityFrameworkCore;
using WebBookmarks.Api.Models;

var builder = WebApplication.CreateBuilder(args);

// Application Insights. No-ops when APPLICATIONINSIGHTS_CONNECTION_STRING is
// absent (e.g. local dev), so it only emits telemetry where it's configured.
builder.Services.AddApplicationInsightsTelemetry();

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
    var query = db.WebBookmarkItems.AsQueryable();
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

    await db.SaveChangesAsync(ct);
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
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { updated = items.Count });
})
    .WithName("BulkUpdateBookmarks")
    .WithOpenApi();

app.MapPatch("/api/bookmarks/{id:int}/favorite", async (int id, WebBookmarksContext db, CancellationToken ct) =>
{
    var item = await db.WebBookmarkItems.FindAsync(new object?[] { id }, ct);
    if (item is null) return Results.NotFound();
    item.IsFavorite = !item.IsFavorite;
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { id = item.Id, isFavorite = item.IsFavorite });
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

// Validates a bookmark payload. Returns null when valid, otherwise a field->messages
// map suitable for Results.ValidationProblem. Blocks dangerous URL schemes
// (javascript:, data:, etc.) so they can never be stored and later navigated to.
static Dictionary<string, string[]>? ValidateBookmark(WebBookmarksItem item)
{
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
