import type { PaletteEntry } from './types';
import { wildcardMatch } from './match';

function googleSearchEntry(payload: string, secondary: string): PaletteEntry {
    return {
        kind: 'action',
        label: `Search Google: ${payload}`,
        secondary,
        alias: '',
        action: 'google-search',
        actionPayload: payload,
    };
}

// Filters the full palette entry list for a given search string, applying the
// prefix operators, wildcard matching, alias/search-URL shortcuts, favorite
// prioritization, and the Google fallback. Pure: same inputs -> same output.
//
// Recognised prefixes:
//   "?term" -> explicit Google search action
//   ">"/">t" -> actions only
//   "/"/"/t" -> bookmarks only
//   "@"/"@t" -> groups only
//   "*"/"*t" -> favorite bookmarks only (sorted by label)
export function filterEntries(allEntries: PaletteEntry[], searchPart: string): PaletteEntry[] {
    const q = searchPart.trim();
    if (!q) return allEntries;
    // Strip recents once a query is active (recents only show on empty query).
    const source = allEntries.filter((e) => !e.isRecent);

    // Google explicit search: prefix with "?"
    if (q.startsWith('?')) {
        const sub = q.slice(1).trim();
        if (!sub) return source;
        return [googleSearchEntry(sub, 'Google')];
    }
    if (q === '>') return source.filter((e) => e.kind === 'action');
    if (q === '/') return source.filter((e) => e.kind === 'bookmark');
    if (q === '@') return source.filter((e) => e.kind === 'group');
    if (q === '*')
        return source
            .filter((e) => e.kind === 'bookmark' && e.bookmark?.isFavorite)
            .sort((a, b) => a.label.localeCompare(b.label));

    let result: PaletteEntry[];
    if (q.startsWith('>')) {
        const sub = q.slice(1).trim();
        result = source.filter(
            (e) => e.kind === 'action' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
        );
    } else if (q.startsWith('/')) {
        const sub = q.slice(1).trim();
        result = source.filter(
            (e) =>
                e.kind === 'bookmark' &&
                (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
        );
    } else if (q.startsWith('@')) {
        const sub = q.slice(1).trim();
        result = source.filter(
            (e) => e.kind === 'group' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
        );
    } else if (q.startsWith('*')) {
        const sub = q.slice(1).trim();
        result = source
            .filter(
                (e) =>
                    e.kind === 'bookmark' &&
                    e.bookmark?.isFavorite &&
                    (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
            )
            .sort((a, b) => a.label.localeCompare(b.label));
    } else {
        result = source.filter(
            (e) => wildcardMatch(e.label, q) || wildcardMatch(e.secondary, q) || wildcardMatch(e.alias, q),
        );
        // Also include bookmarks with search URLs when the first word matches
        // alias or name (e.g. "g hello world", "seek msft").
        if (q.includes(' ')) {
            const shortcutPart = q.split(/\s+/)[0].toLowerCase();
            for (const e of source) {
                if (
                    e.kind === 'bookmark' &&
                    e.bookmark?.urls &&
                    (e.alias.toLowerCase() === shortcutPart || e.label.toLowerCase().startsWith(shortcutPart)) &&
                    !result.includes(e)
                ) {
                    result.push(e);
                }
            }
        }
        // Prioritize favorites: favorites first, preserving original order within
        // each group.
        const favorites = result.filter((e) => e.kind === 'bookmark' && e.bookmark?.isFavorite);
        const nonFavorites = result.filter((e) => !(e.kind === 'bookmark' && e.bookmark?.isFavorite));
        result = [...favorites, ...nonFavorites];
    }

    // Google fallback: if nothing matched, offer a web search.
    if (result.length === 0) {
        result = [googleSearchEntry(q, 'No bookmark matches \u2014 search the web')];
    }
    return result;
}
