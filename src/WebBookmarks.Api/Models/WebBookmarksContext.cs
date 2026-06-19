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

        // Bound the indexed columns. Unbounded string maps to nvarchar(max),
        // which SQL Server cannot use as an index key. Lengths match the
        // validation caps in Program.ValidateBookmark.
        item.Property(b => b.Profile).HasMaxLength(100);
        item.Property(b => b.BookmarkGroup).HasMaxLength(200);

        // Indexes matching the common query shapes: list/groups filter by
        // Profile (+ IsVisible) and order by BookmarkGroup then SortOrder.
        // NOTE: declared on the EF model — apply to the live DB via a migration
        // or the equivalent statements in Database/001-add-indexes.sql.
        item.HasIndex(b => b.Profile);
        item.HasIndex(b => new { b.BookmarkGroup, b.SortOrder });
    }
}
