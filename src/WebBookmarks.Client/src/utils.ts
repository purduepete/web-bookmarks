import type { WebBookmarksItem } from './types';
import { resolveBookmarkUrl } from './palette-core';

// wildcardMatch and resolveBookmarkUrl now live in the shared palette-core;
// re-exported here so existing '../utils' import sites keep working.
export { wildcardMatch, resolveBookmarkUrl } from './palette-core';

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Neutralizes URLs that use a dangerous scheme (javascript:, data:, vbscript:)
// by collapsing them to about:blank, so they can never execute when navigated to
// or rendered into an href. All other schemes (http, https, file, mailto,
// tel, ...) and relative URLs are left untouched.
const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript):/i;

export function sanitizeUrl(url: string): string {
    const value = url ?? '';
    // Browsers strip ASCII control chars (tab/newline/CR, etc.) from URLs before
    // parsing, so "java\tscript:" would execute. Strip them before the scheme test
    // so such payloads can't bypass the blocklist; the original value is returned
    // unchanged when it is safe.
    // eslint-disable-next-line no-control-regex -- control chars are the payload we strip
    const stripped = value.replace(/[\u0000-\u001F\u007F]/g, '');
    return UNSAFE_SCHEME.test(stripped) ? 'about:blank' : value;
}

export function openUrls(items: { name: string; url: string }[], openInNewTab = false) {
    if (items.length === 0) return;
    if (isSafari && items.length > 1) {
        const selfUrl = window.location.href;
        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening bookmarks...</title>
<style>body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;padding:20px}
a{display:block;padding:14px;margin:8px 0;background:#16213e;color:#4fc3f7;border-radius:8px;text-decoration:none;font-size:17px}
a:active{background:#0f3460}
.self-link{background:#0f3460;color:#93c5fd;font-weight:600}
.divider{border:none;border-top:1px solid #334155;margin:12px 0}</style></head><body>
<a href="${escapeHtml(sanitizeUrl(selfUrl))}" class="self-link">WebBookmarks</a>
<hr class="divider">
<h2>Tap each to open:</h2>
${items.map((item) => `<a href="${escapeHtml(sanitizeUrl(item.url))}" target="_blank">${escapeHtml(item.name)}</a>`).join('')}
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        window.location.href = URL.createObjectURL(blob);
    } else if (openInNewTab) {
        let win: Window | null = null;
        for (const item of items) {
            win = window.open(sanitizeUrl(item.url), '_blank', 'noopener');
        }
        win?.focus();
    } else {
        // Open the non-final URLs synchronously inside the click's user-gesture
        // stack; async (setTimeout) window.open calls are treated as unsolicited
        // popups and blocked, so extra tabs would silently fail to open.
        for (let i = 0; i < items.length - 1; i++) {
            window.open(sanitizeUrl(items[i].url), '_blank', 'noopener');
        }
        window.location.href = sanitizeUrl(items[items.length - 1].url);
    }
}

// Resolves a raw "<shortcut> <terms…>" command against the bookmark list and, if
// it matches (by exact then partial alias, then by name for search-URL bookmarks),
// opens the matching bookmark(s). Returns true when it navigated, false otherwise.
export function navigateByShortcut(input: string, bookmarks: WebBookmarksItem[], openInNewTab = false): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;

    const parts = trimmed.split(/\s+/);
    const shortcut = parts[0].toLowerCase();
    const searchQuery = parts.slice(1).join(' ');

    let matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase() === shortcut);
    if (matches.length === 0) {
        matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase().includes(shortcut));
    }
    // Also match by name for bookmarks with search URLs (e.g. "seek msft")
    if (matches.length === 0 && searchQuery) {
        matches = bookmarks.filter((b) => b.urls && b.name.toLowerCase().startsWith(shortcut));
    }

    if (matches.length === 0) return false;

    openUrls(
        matches.map((m) => ({
            name: m.name,
            url: resolveBookmarkUrl(m, trimmed),
        })),
        openInNewTab,
    );
    return true;
}
