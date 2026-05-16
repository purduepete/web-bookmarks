const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function openUrls(items: { name: string; url: string }[]) {
    if (items.length === 0) return;
    if (isSafari && items.length > 1) {
        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening bookmarks...</title>
<style>body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;padding:20px}
a{display:block;padding:14px;margin:8px 0;background:#16213e;color:#4fc3f7;border-radius:8px;text-decoration:none;font-size:17px}
a:active{background:#0f3460}</style></head><body>
<h2>Tap each to open:</h2>
${items.map((item) => `<a href="${item.url}" target="_blank">${item.name}</a>`).join('')}
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        window.location.href = URL.createObjectURL(blob);
    } else {
        let i = 0;
        function next() {
            if (i < items.length - 1) {
                window.open(items[i].url, '_blank', 'noopener');
                i++;
                setTimeout(next, 500);
            } else {
                window.location.href = items[i].url;
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
