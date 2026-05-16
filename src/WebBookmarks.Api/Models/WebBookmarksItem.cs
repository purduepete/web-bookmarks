namespace WebBookmarks.Api.Models;

public class WebBookmarksItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Shortcut { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    [System.Text.Json.Serialization.JsonPropertyName("url")]
    public string URL { get; set; } = string.Empty;
    [System.Text.Json.Serialization.JsonPropertyName("urls")]
    public string? URLs { get; set; }
    public bool IsVisible { get; set; }
    public string BookmarkGroup { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string Profile { get; set; } = "home";
}
