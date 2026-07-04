// Case-insensitive matcher. Without a '*' it is a plain substring test; with
// one or more '*' the non-empty segments must appear in order.
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
