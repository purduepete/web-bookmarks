import { describe, it, expect } from 'vitest';
import type { Bookmark, PaletteEntry, MruEntry } from './index';
import {
    wildcardMatch,
    resolveBookmarkUrl,
    parseNumberSelection,
    detectNumberSelection,
    assignBookmarkNumbers,
    filterEntries,
    applyMru,
    MRU_MAX_ENTRIES,
} from './index';

function bm(over: Partial<Bookmark>): Bookmark {
    return {
        id: 1,
        name: 'Name',
        shortcut: '',
        description: '',
        url: 'https://example.com',
        urls: null,
        isVisible: true,
        bookmarkGroup: 'G',
        sortOrder: 0,
        profile: 'home',
        isFavorite: false,
        ...over,
    };
}

function entry(over: Partial<PaletteEntry>): PaletteEntry {
    return { kind: 'bookmark', label: '', secondary: '', alias: '', ...over };
}

describe('wildcardMatch', () => {
    it('substring match is case-insensitive when no *', () => {
        expect(wildcardMatch('Hello World', 'world')).toBe(true);
        expect(wildcardMatch('Hello', 'xyz')).toBe(false);
    });
    it('* matches ordered segments', () => {
        expect(wildcardMatch('foobarbaz', 'foo*baz')).toBe(true);
        expect(wildcardMatch('foobarbaz', 'baz*foo')).toBe(false);
        expect(wildcardMatch('abc', '*')).toBe(true);
    });
});

describe('resolveBookmarkUrl', () => {
    it('returns plain url when no search template', () => {
        const b = bm({ url: 'https://a.com', urls: null });
        expect(resolveBookmarkUrl(b, 'a hello')).toBe('https://a.com');
    });
    it('substitutes {q} when first word matches alias', () => {
        const b = bm({ shortcut: 'g', urls: 'https://s.com?q={q}', url: 'https://s.com' });
        expect(resolveBookmarkUrl(b, 'g hello world')).toBe('https://s.com?q=hello%20world');
    });
    it('substitutes {q} when first word is a name prefix', () => {
        const b = bm({ name: 'Seek', shortcut: '', urls: 'https://s.com?q={q}', url: 'https://s.com' });
        expect(resolveBookmarkUrl(b, 'seek msft')).toBe('https://s.com?q=msft');
    });
    it('returns plain url when only one word', () => {
        const b = bm({ shortcut: 'g', urls: 'https://s.com?q={q}', url: 'https://s.com' });
        expect(resolveBookmarkUrl(b, 'g')).toBe('https://s.com');
    });
});

describe('parseNumberSelection', () => {
    it('parses singles, commas and ranges', () => {
        expect([...(parseNumberSelection('1,3-5') ?? [])]).toEqual([1, 3, 4, 5]);
    });
    it('handles reversed ranges', () => {
        expect([...(parseNumberSelection('5-3') ?? [])]).toEqual([3, 4, 5]);
    });
    it('returns null on invalid input', () => {
        expect(parseNumberSelection('1,a')).toBeNull();
        expect(parseNumberSelection('')).toBeNull();
    });
});

describe('detectNumberSelection', () => {
    it('splits trailing numbers from the search part', () => {
        const r = detectNumberSelection('docs 1,3');
        expect(r.searchPart).toBe('docs');
        expect([...(r.numberSelection ?? [])]).toEqual([1, 3]);
    });
    it('leaves plain queries untouched', () => {
        const r = detectNumberSelection('docs');
        expect(r.searchPart).toBe('docs');
        expect(r.numberSelection).toBeNull();
    });
});

describe('assignBookmarkNumbers', () => {
    it('numbers only bookmark rows sequentially by display index', () => {
        const list = [
            entry({ kind: 'group' }),
            entry({ kind: 'bookmark' }),
            entry({ kind: 'action' }),
            entry({ kind: 'bookmark' }),
        ];
        const map = assignBookmarkNumbers(list);
        expect(map.get(1)).toBe(1);
        expect(map.get(3)).toBe(2);
        expect(map.has(0)).toBe(false);
    });
});

describe('filterEntries', () => {
    const entries: PaletteEntry[] = [
        entry({ kind: 'bookmark', label: 'Recent', isRecent: true, bookmark: bm({ id: 9 }) }),
        entry({ kind: 'group', label: 'Work', alias: '' }),
        entry({ kind: 'bookmark', label: 'GitHub', alias: 'gh', bookmark: bm({ id: 1 }) }),
        entry({ kind: 'bookmark', label: 'Gmail', alias: 'gm', bookmark: bm({ id: 2, isFavorite: true }) }),
        entry({ kind: 'action', label: 'New bookmark', secondary: 'Create', action: 'new-bookmark' }),
    ];

    it('returns all entries (incl. recents) for empty query', () => {
        expect(filterEntries(entries, '')).toBe(entries);
    });
    it('drops recents once a query is present', () => {
        const r = filterEntries(entries, 'g');
        expect(r.some((e) => e.isRecent)).toBe(false);
    });
    it('/ shows bookmarks only', () => {
        expect(filterEntries(entries, '/').every((e) => e.kind === 'bookmark')).toBe(true);
    });
    it('@ shows groups only', () => {
        expect(filterEntries(entries, '@').every((e) => e.kind === 'group')).toBe(true);
    });
    it('> shows actions only', () => {
        expect(filterEntries(entries, '>').every((e) => e.kind === 'action')).toBe(true);
    });
    it('* shows favorites only', () => {
        const r = filterEntries(entries, '*');
        expect(r.length).toBe(1);
        expect(r[0].bookmark?.id).toBe(2);
    });
    it('prioritizes favorites in general search', () => {
        const r = filterEntries(entries, 'g');
        const bookmarks = r.filter((e) => e.kind === 'bookmark');
        expect(bookmarks[0].bookmark?.isFavorite).toBe(true);
    });
    it('offers a Google fallback when nothing matches', () => {
        const r = filterEntries(entries, 'zzzznomatch');
        expect(r).toHaveLength(1);
        expect(r[0].action).toBe('google-search');
        expect(r[0].actionPayload).toBe('zzzznomatch');
    });
    it('? triggers an explicit Google action', () => {
        const r = filterEntries(entries, '?cats');
        expect(r).toHaveLength(1);
        expect(r[0].action).toBe('google-search');
        expect(r[0].actionPayload).toBe('cats');
    });
});

describe('applyMru', () => {
    it('appends a new id with count 1', () => {
        const r = applyMru([], 5, 1000);
        expect(r).toEqual([{ id: 5, count: 1, ts: 1000 }]);
    });
    it('increments count and restamps existing id, sorting by recency', () => {
        const start: MruEntry[] = [
            { id: 1, count: 1, ts: 100 },
            { id: 2, count: 1, ts: 200 },
        ];
        const r = applyMru(start, 1, 300);
        expect(r[0]).toEqual({ id: 1, count: 2, ts: 300 });
        expect(r[1].id).toBe(2);
    });
    it('does not mutate the input list', () => {
        const start: MruEntry[] = [{ id: 1, count: 1, ts: 100 }];
        applyMru(start, 1, 300);
        expect(start[0]).toEqual({ id: 1, count: 1, ts: 100 });
    });
    it('truncates to MRU_MAX_ENTRIES', () => {
        const start: MruEntry[] = Array.from({ length: MRU_MAX_ENTRIES }, (_, i) => ({
            id: i + 1,
            count: 1,
            ts: i,
        }));
        const r = applyMru(start, 999, MRU_MAX_ENTRIES + 10);
        expect(r).toHaveLength(MRU_MAX_ENTRIES);
        expect(r[0].id).toBe(999);
    });
    it('returns a copy unchanged when id is 0', () => {
        const start: MruEntry[] = [{ id: 1, count: 1, ts: 100 }];
        const r = applyMru(start, 0, 500);
        expect(r).toEqual(start);
        expect(r).not.toBe(start);
    });
});
