// Resolves the URL to open for a bookmark given the current query. When the
// bookmark has a search URL (containing a {q} placeholder) and the query is
// "<alias-or-name> <terms…>", the terms are substituted into the search URL.
// Otherwise the bookmark's plain URL is returned.
export function resolveBookmarkUrl(
    bookmark: { url: string; urls: string | null; shortcut: string; name: string },
    query: string,
): string {
    if (!bookmark.urls) return bookmark.url;
    const parts = query.trim().split(/\s+/);
    if (parts.length < 2) return bookmark.url;
    const firstWord = parts[0].toLowerCase();
    const alias = (bookmark.shortcut || '').trim().toLowerCase();
    if ((alias && firstWord === alias) || bookmark.name.toLowerCase().startsWith(firstWord)) {
        return bookmark.urls.replace('{q}', encodeURIComponent(parts.slice(1).join(' ')));
    }
    return bookmark.url;
}
