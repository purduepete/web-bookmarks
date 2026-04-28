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

app.MapGet("/api/bookmarks", async (bool? includeHidden, WebBookmarksContext db) =>
{
    var query = db.WebBookmarkItems.AsQueryable();
    if (includeHidden != true)
        query = query.Where(b => b.IsVisible);
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
        b.Shortcut.ToLower().Contains(lower) || lower.Contains(b.Shortcut.ToLower()));

    if (excludeId.HasValue)
        query = query.Where(b => b.Id != excludeId.Value);

    var matches = await query.Select(b => new { b.Id, b.Name, b.Shortcut }).ToListAsync();
    return Results.Ok(new { isDuplicate = matches.Count > 0, matches });
})
    .WithName("CheckAlias")
    .WithOpenApi();

app.MapGet("/api/bookmarks/groups", async (WebBookmarksContext db) =>
    await db.WebBookmarkItems
        .Where(b => b.IsVisible)
        .Select(b => b.BookmarkGroup)
        .Distinct()
        .OrderBy(g => g)
        .ToListAsync())
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

app.Run();

record ReorderEntry(int Id, int SortOrder);
