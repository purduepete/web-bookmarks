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

// CORS for local development (Static Web Apps proxies in production)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173")
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

// ── Bookmark Endpoints ──────────────────────────────────────────────

app.MapGet("/api/bookmarks", async (bool? includeHidden, string? profile, WebBookmarksContext db) =>
{
    var query = db.WebBookmarkItems.AsQueryable();
    if (includeHidden != true)
        query = query.Where(b => b.IsVisible);
    if (!string.IsNullOrEmpty(profile))
        query = query.Where(b => b.Profile == profile || b.Profile == "all");
    return await query
        .OrderBy(b => b.BookmarkGroup)
        .ThenBy(b => b.SortOrder)
        .ToListAsync();
})
    .WithName("GetBookmarks")
    .WithOpenApi();

app.MapGet("/api/bookmarks/{id:int}", async (int id, WebBookmarksContext db) =>
    await db.WebBookmarkItems.FindAsync(id) is { } item
        ? Results.Ok(item)
        : Results.NotFound())
    .WithName("GetBookmark")
    .WithOpenApi();

app.MapPost("/api/bookmarks", async (WebBookmarksItem item, WebBookmarksContext db) =>
{
    db.WebBookmarkItems.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/bookmarks/{item.Id}", item);
})
    .WithName("CreateBookmark")
    .WithOpenApi();

app.MapPut("/api/bookmarks/{id:int}", async (int id, WebBookmarksItem input, WebBookmarksContext db) =>
{
    var item = await db.WebBookmarkItems.FindAsync(id);
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

    await db.SaveChangesAsync();
    return Results.NoContent();
})
    .WithName("UpdateBookmark")
    .WithOpenApi();

app.MapDelete("/api/bookmarks/{id:int}", async (int id, WebBookmarksContext db) =>
{
    var item = await db.WebBookmarkItems.FindAsync(id);
    if (item is null) return Results.NotFound();

    db.WebBookmarkItems.Remove(item);
    await db.SaveChangesAsync();
    return Results.NoContent();
})
    .WithName("DeleteBookmark")
    .WithOpenApi();

app.MapGet("/api/bookmarks/check-alias", async (string alias, int? excludeId, WebBookmarksContext db) =>
{
    var lower = alias.Trim().ToLower();
    var query = db.WebBookmarkItems.Where(b =>
        b.Shortcut != "" && (b.Shortcut.ToLower().Contains(lower) || lower.Contains(b.Shortcut.ToLower())));

    if (excludeId.HasValue)
        query = query.Where(b => b.Id != excludeId.Value);

    var matches = await query.Select(b => new { b.Id, b.Name, b.Shortcut }).ToListAsync();
    return Results.Ok(new { isDuplicate = matches.Count > 0, matches });
})
    .WithName("CheckAlias")
    .WithOpenApi();

app.MapGet("/api/bookmarks/groups", async (string? profile, WebBookmarksContext db) =>
{
    var query = db.WebBookmarkItems.Where(b => b.IsVisible);
    if (!string.IsNullOrEmpty(profile))
        query = query.Where(b => b.Profile == profile || b.Profile == "all");
    return await query
        .Select(b => b.BookmarkGroup)
        .Distinct()
        .OrderBy(g => g)
        .ToListAsync();
})
    .WithName("GetGroups")
    .WithOpenApi();

app.MapPost("/api/bookmarks/reorder", async (List<ReorderEntry> entries, WebBookmarksContext db) =>
{
    foreach (var entry in entries)
    {
        var item = await db.WebBookmarkItems.FindAsync(entry.Id);
        if (item is not null)
            item.SortOrder = entry.SortOrder;
    }
    await db.SaveChangesAsync();
    return Results.NoContent();
})
    .WithName("ReorderBookmarks")
    .WithOpenApi();

app.MapGet("/api/bookmarks/profiles", async (WebBookmarksContext db) =>
    await db.WebBookmarkItems
        .Select(b => b.Profile)
        .Distinct()
        .OrderBy(p => p)
        .ToListAsync())
    .WithName("GetProfiles")
    .WithOpenApi();

app.MapPost("/api/bookmarks/bulk", async (List<WebBookmarksItem> items, WebBookmarksContext db) =>
{
    db.WebBookmarkItems.AddRange(items);
    await db.SaveChangesAsync();
    return Results.Ok(new { imported = items.Count });
})
    .WithName("BulkCreateBookmarks")
    .WithOpenApi();

app.MapPut("/api/bookmarks/bulk", async (BulkUpdateRequest request, WebBookmarksContext db) =>
{
    var items = await db.WebBookmarkItems
        .Where(b => request.Ids.Contains(b.Id))
        .ToListAsync();
    foreach (var item in items)
    {
        if (request.Profile is not null) item.Profile = request.Profile;
        if (request.BookmarkGroup is not null) item.BookmarkGroup = request.BookmarkGroup;
        if (request.Shortcut is not null) item.Shortcut = request.Shortcut;
        if (request.ClearShortcut == true) item.Shortcut = string.Empty;
        if (request.IsVisible is not null) item.IsVisible = request.IsVisible.Value;
        if (request.IsFavorite is not null) item.IsFavorite = request.IsFavorite.Value;
    }
    var count = await db.SaveChangesAsync();
    return Results.Ok(new { updated = items.Count });
})
    .WithName("BulkUpdateBookmarks")
    .WithOpenApi();

app.MapPatch("/api/bookmarks/{id:int}/favorite", async (int id, WebBookmarksContext db) =>
{
    var item = await db.WebBookmarkItems.FindAsync(id);
    if (item is null) return Results.NotFound();
    item.IsFavorite = !item.IsFavorite;
    await db.SaveChangesAsync();
    return Results.Ok(new { id = item.Id, isFavorite = item.IsFavorite });
})
    .WithName("ToggleFavorite")
    .WithOpenApi();

app.MapPost("/api/bookmarks/bulk-delete", async (List<int> ids, WebBookmarksContext db) =>
{
    var items = await db.WebBookmarkItems
        .Where(b => ids.Contains(b.Id))
        .ToListAsync();
    db.WebBookmarkItems.RemoveRange(items);
    await db.SaveChangesAsync();
    return Results.Ok(new { deleted = items.Count });
})
    .WithName("BulkDeleteBookmarks")
    .WithOpenApi();

app.Run();

record ReorderEntry(int Id, int SortOrder);
record BulkUpdateRequest(List<int> Ids, string? Profile, string? BookmarkGroup, string? Shortcut, bool? IsVisible, bool? ClearShortcut, bool? IsFavorite);
