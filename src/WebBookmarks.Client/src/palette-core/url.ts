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

// Neutralizes URLs that use a dangerous scheme (javascript:, data:, vbscript:) by
// collapsing them to about:blank, so they can never execute when navigated to or
// rendered into an href. All other schemes (http, https, file, mailto, tel, ...)
// and relative URLs are returned unchanged. Host-neutral (no DOM), so both the
// React client and the userscript share one source of navigation-safety truth.
const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript):/i;

export function sanitizeUrl(url: string): string {
    const value = url ?? '';
    // Browsers strip ASCII control chars (tab/newline/CR, etc.) from URLs before
    // parsing, so "java\tscript:" would execute. Strip them before the scheme test
    // so such payloads can't bypass the blocklist.
    // eslint-disable-next-line no-control-regex -- control chars are the payload we strip
    const stripped = value.replace(/[\u0000-\u001F\u007F]/g, '');
    return UNSAFE_SCHEME.test(stripped) ? 'about:blank' : value;
}
