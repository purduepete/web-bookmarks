import type { Bookmark, BookmarkGroup, MruEntry, PaletteEntry } from './types';
import { MRU_LIMIT } from './mru';

// Builds the flat, host-agnostic palette entry list: most-recently-used bookmarks
// first (capped at MRU_LIMIT, only ones still present in `groups`), then a row per
// group, then a row per bookmark, then the host-provided `actions` appended in the
// order given. Pure — no DOM/host/React deps. Each host supplies its own action
// rows (and their ordering, e.g. alphabetical) so only the truly shared flattening
// lives here; this replaces the near-identical copies that used to drift between
// the React app and the Tampermonkey userscript.
export function buildPaletteEntries(
    groups: BookmarkGroup[],
    mru: MruEntry[],
    actions: PaletteEntry[],
): PaletteEntry[] {
    const entries: PaletteEntry[] = [];

    // Recents (only surfaced when the query is empty; filterEntries strips them
    // otherwise). Resolve each MRU id against the current bookmarks, skip stale ids.
    const bmById = new Map<number, Bookmark>();
    for (const g of groups) for (const b of g.items) bmById.set(b.id, b);
    let added = 0;
    for (const m of mru) {
        const b = bmById.get(m.id);
        if (!b) continue;
        entries.push({
            kind: 'bookmark',
            label: b.name,
            secondary: b.bookmarkGroup,
            alias: b.shortcut,
            bookmark: b,
            isRecent: true,
        });
        if (++added >= MRU_LIMIT) break;
    }

    for (const g of groups) {
        entries.push({
            kind: 'group',
            label: g.name,
            secondary: `${g.items.length} bookmark${g.items.length !== 1 ? 's' : ''}`,
            alias: '',
            group: g,
        });
    }

    for (const g of groups) {
        for (const b of g.items) {
            entries.push({
                kind: 'bookmark',
                label: b.name,
                secondary: b.bookmarkGroup,
                alias: b.shortcut,
                bookmark: b,
            });
        }
    }

    for (const a of actions) entries.push(a);
    return entries;
}
