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
        var sqlServer = Database.ProviderName == "Microsoft.EntityFrameworkCore.SqlServer";
        if (sqlServer)
        {
            item.ToTable("webbookmarkitems", "wb");
            item.Property(b => b.Profile).HasMaxLength(100);
            item.Property(b => b.BookmarkGroup).HasMaxLength(200);
        }
        else
        {
            modelBuilder.HasDefaultSchema("public");
            item.ToTable("webbookmarkitems");
        }

        // Indexes matching the common query shapes: list/groups filter by
        // Profile (+ IsVisible) and order by BookmarkGroup then SortOrder.
        // NOTE: declared on the EF model — apply to the live DB via a migration
        // or deploy/postgresql/001_initial.sql.
        item.HasIndex(b => b.Profile);
        item.HasIndex(b => new { b.BookmarkGroup, b.SortOrder });
    }
}
