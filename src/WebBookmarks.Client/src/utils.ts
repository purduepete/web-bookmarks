import type { WebBookmarksItem } from './types';
import { resolveShortcutTargets, sanitizeUrl } from './palette-core';

// wildcardMatch, resolveBookmarkUrl and sanitizeUrl now live in the shared
// palette-core; re-exported here so existing '../utils' import sites keep working.
export { wildcardMatch, resolveBookmarkUrl, sanitizeUrl } from './palette-core';

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
// it matches, opens the matching bookmark(s). Matching + URL resolution live in
// palette-core (resolveShortcutTargets) so this and the palette stay in sync.
// Returns true when it navigated, false otherwise.
export function navigateByShortcut(input: string, bookmarks: WebBookmarksItem[], openInNewTab = false): boolean {
    const targets = resolveShortcutTargets(input, bookmarks);
    if (targets.length === 0) return false;
    openUrls(targets, openInNewTab);
    return true;
}
