namespace WebBookmarks.Api.Models;

public class WebBookmarksItem
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Shortcut { get; set; }
    public string? Description { get; set; }
    [System.Text.Json.Serialization.JsonPropertyName("url")]
    public string? URL { get; set; }
    [System.Text.Json.Serialization.JsonPropertyName("urls")]
    public string? URLs { get; set; }
    public bool IsVisible { get; set; }
    public string? BookmarkGroup { get; set; }
    public int SortOrder { get; set; }
    public string? Profile { get; set; }
    public bool IsFavorite { get; set; }
}
