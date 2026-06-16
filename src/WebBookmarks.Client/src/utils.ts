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
    return UNSAFE_SCHEME.test(value) ? 'about:blank' : value;
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
        let i = 0;
        function next() {
            if (i < items.length - 1) {
                window.open(sanitizeUrl(items[i].url), '_blank', 'noopener');
                i++;
                setTimeout(next, 500);
            } else {
                window.location.href = sanitizeUrl(items[i].url);
            }
        }
        next();
    }
}

export function wildcardMatch(text: string, pattern: string): boolean {
    const lower = text.toLowerCase();
    if (!pattern.includes('*')) {
        return lower.includes(pattern.toLowerCase());
    }
    const parts = pattern.toLowerCase().split('*');
    let pos = 0;
    for (const part of parts) {
        if (!part) continue;
        const idx = lower.indexOf(part, pos);
        if (idx === -1) return false;
        pos = idx + part.length;
    }
    return true;
}
