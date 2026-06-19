using Microsoft.EntityFrameworkCore;

namespace WebBookmarks.Api.Models;

public class WebBookmarksContext : DbContext
{
    public WebBookmarksContext(DbContextOptions<WebBookmarksContext> options)
        : base(options)
    {
    }

    public DbSet<WebBookmarksItem> WebBookmarkItems { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var item = modelBuilder.Entity<WebBookmarksItem>();
        item.ToTable("webbookmarkitems");

        // Indexes matching the common query shapes: list/groups filter by
        // Profile (+ IsVisible) and order by BookmarkGroup then SortOrder.
        // NOTE: declared on the EF model — apply to the live DB via a migration
        // or the equivalent CREATE INDEX statements.
        item.HasIndex(b => b.Profile);
        item.HasIndex(b => new { b.BookmarkGroup, b.SortOrder });
    }
}
