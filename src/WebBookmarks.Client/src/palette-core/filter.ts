import type { PaletteEntry } from './types';
import { wildcardMatchLower } from './match';

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

// Per-entry cache of lower-cased searchable fields, keyed by the entry object so
// it's naturally evicted when the palette rebuilds its entries (new objects). This
// avoids re-lower-casing label/secondary/alias for every entry on every keystroke.
const lowerFieldsCache = new WeakMap<PaletteEntry, { label: string; secondary: string; alias: string }>();
function lowerFields(e: PaletteEntry): { label: string; secondary: string; alias: string } {
    let f = lowerFieldsCache.get(e);
    if (!f) {
        f = { label: e.label.toLowerCase(), secondary: e.secondary.toLowerCase(), alias: e.alias.toLowerCase() };
        lowerFieldsCache.set(e, f);
    }
    return f;
}
function matchLabelSecondary(e: PaletteEntry, lowerNeedle: string): boolean {
    const f = lowerFields(e);
    return wildcardMatchLower(f.label, lowerNeedle) || wildcardMatchLower(f.secondary, lowerNeedle);
}
function matchLabelSecondaryAlias(e: PaletteEntry, lowerNeedle: string): boolean {
    const f = lowerFields(e);
    return (
        wildcardMatchLower(f.label, lowerNeedle) ||
        wildcardMatchLower(f.secondary, lowerNeedle) ||
        wildcardMatchLower(f.alias, lowerNeedle)
    );
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
        const sub = q.slice(1).trim().toLowerCase();
        result = source.filter((e) => e.kind === 'action' && matchLabelSecondary(e, sub));
    } else if (q.startsWith('/')) {
        const sub = q.slice(1).trim().toLowerCase();
        result = source.filter((e) => e.kind === 'bookmark' && matchLabelSecondaryAlias(e, sub));
    } else if (q.startsWith('@')) {
        const sub = q.slice(1).trim().toLowerCase();
        result = source.filter((e) => e.kind === 'group' && matchLabelSecondary(e, sub));
    } else if (q.startsWith('*')) {
        const sub = q.slice(1).trim().toLowerCase();
        result = source
            .filter((e) => e.kind === 'bookmark' && e.bookmark?.isFavorite && matchLabelSecondaryAlias(e, sub))
            .sort((a, b) => a.label.localeCompare(b.label));
    } else {
        const lq = q.toLowerCase();
        result = source.filter((e) => matchLabelSecondaryAlias(e, lq));
        // Also include bookmarks with search URLs when the first word matches
        // alias or name (e.g. "g hello world", "seek msft").
        if (q.includes(' ')) {
            const shortcutPart = q.split(/\s+/)[0].toLowerCase();
            const seen = new Set(result);
            for (const e of source) {
                if (e.kind !== 'bookmark' || !e.bookmark?.urls || seen.has(e)) continue;
                const f = lowerFields(e);
                if (f.alias === shortcutPart || f.label.startsWith(shortcutPart)) {
                    result.push(e);
                    seen.add(e);
                }
            }
        }
        // Prioritize favorites: favorites first, preserving original order within
        // each group (single pass).
        const favorites: PaletteEntry[] = [];
        const nonFavorites: PaletteEntry[] = [];
        for (const e of result) {
            if (e.kind === 'bookmark' && e.bookmark?.isFavorite) favorites.push(e);
            else nonFavorites.push(e);
        }
        result = [...favorites, ...nonFavorites];
    }

    // Google fallback: if nothing matched, offer a web search.
    if (result.length === 0) {
        result = [googleSearchEntry(q, 'No bookmark matches \u2014 search the web')];
    }
    return result;
}
