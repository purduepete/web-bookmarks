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
        modelBuilder.Entity<WebBookmarksItem>().ToTable("webbookmarkitems");
    }
}
