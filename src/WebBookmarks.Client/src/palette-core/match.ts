// Case-insensitive matcher. Without a '*' it is a plain substring test; with
// one or more '*' the non-empty segments must appear in order.
export function wildcardMatch(text: string, pattern: string): boolean {
    return wildcardMatchLower(text.toLowerCase(), pattern.toLowerCase());
}

// Same as wildcardMatch but both arguments must already be lower-cased. Lets the
// hot palette-filter path lower-case the query once and reuse cached lower-cased
// entry fields, instead of re-lower-casing every field on every keystroke.
export function wildcardMatchLower(lowerText: string, lowerPattern: string): boolean {
    if (!lowerPattern.includes('*')) {
        return lowerText.includes(lowerPattern);
    }
    const parts = lowerPattern.split('*');
    let pos = 0;
    for (const part of parts) {
        if (!part) continue;
        const idx = lowerText.indexOf(part, pos);
        if (idx === -1) return false;
        pos = idx + part.length;
    }
    return true;
}
