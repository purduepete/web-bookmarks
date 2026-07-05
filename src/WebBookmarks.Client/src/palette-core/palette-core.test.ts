import { describe, it, expect } from 'vitest';
import type { Bookmark, BookmarkGroup, PaletteEntry, MruEntry } from './index';
import {
    wildcardMatch,
    resolveBookmarkUrl,
    parseNumberSelection,
    detectNumberSelection,
    assignBookmarkNumbers,
    filterEntries,
    buildPaletteEntries,
    applyMru,
    applyMruMany,
    MRU_LIMIT,
    MRU_MAX_ENTRIES,
    resolveShortcutTargets,
    sanitizeUrl,
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

// Locks in D1 (#57): shortcut command resolution shared with the React client's
// navigateByShortcut, so the startup prompt and the palette resolve identically.
describe('resolveShortcutTargets', () => {
    const bookmarks = [
        bm({ id: 1, name: 'GitHub', shortcut: 'gh', url: 'https://github.com' }),
        bm({ id: 2, name: 'GitLab', shortcut: 'gl', url: 'https://gitlab.com' }),
        bm({ id: 3, name: 'Google', shortcut: 'g', url: 'https://google.com', urls: 'https://google.com/search?q={q}' }),
    ];

    it('returns nothing for blank input', () => {
        expect(resolveShortcutTargets('   ', bookmarks)).toEqual([]);
    });

    it('matches an exact alias', () => {
        expect(resolveShortcutTargets('gh', bookmarks)).toEqual([{ name: 'GitHub', url: 'https://github.com' }]);
    });

    it('falls back to partial alias match when no exact match', () => {
        // "git" isn't an exact alias; nothing has it as a substring -> no match.
        expect(resolveShortcutTargets('git', bookmarks)).toEqual([]);
        // "g" is an exact alias (Google) -> exact wins over partial.
        expect(resolveShortcutTargets('g foo', bookmarks)).toEqual([
            { name: 'Google', url: 'https://google.com/search?q=foo' },
        ]);
    });

    it('matches by name prefix for search-URL bookmarks when alias fails', () => {
        expect(resolveShortcutTargets('goo bar baz', bookmarks)).toEqual([
            { name: 'Google', url: 'https://google.com/search?q=bar%20baz' },
        ]);
    });

    it('returns no target when nothing matches', () => {
        expect(resolveShortcutTargets('zzz nope', bookmarks)).toEqual([]);
    });
});

// Locks in D2 (#58): the URL-safety blocklist shared by the React client and the
// userscript so navigation safety rules can't drift between hosts.
describe('sanitizeUrl', () => {
    it('passes safe URLs through unchanged', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('/relative/path')).toBe('/relative/path');
        expect(sanitizeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    });

    it('collapses dangerous schemes to about:blank', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('  JAVASCRIPT:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('data:text/html,x')).toBe('about:blank');
        expect(sanitizeUrl('vbscript:msgbox')).toBe('about:blank');
    });

    it('blocks control-char-obfuscated schemes', () => {
        expect(sanitizeUrl('java\tscript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('java\u0000script:alert(1)')).toBe('about:blank');
    });
});

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

describe('buildPaletteEntries', () => {
    const group = (name: string, items: Bookmark[]): BookmarkGroup => ({ name, items });
    const action = (label: string): PaletteEntry => entry({ kind: 'action', label, action: label });

    it('orders recents, then groups, then bookmarks, then actions as given', () => {
        const b1 = bm({ id: 1, name: 'One', bookmarkGroup: 'G', shortcut: 'o' });
        const b2 = bm({ id: 2, name: 'Two', bookmarkGroup: 'G' });
        const groups = [group('G', [b1, b2])];
        const mru: MruEntry[] = [{ id: 2, count: 1, ts: 100 }];
        const actions = [action('Zed'), action('Abc')];

        const out = buildPaletteEntries(groups, mru, actions);
        const kinds = out.map((e) => e.kind);
        // recent bookmark, group, 2 bookmarks, 2 actions (in given order)
        expect(kinds).toEqual(['bookmark', 'group', 'bookmark', 'bookmark', 'action', 'action']);
        expect(out[0].isRecent).toBe(true);
        expect(out[0].bookmark?.id).toBe(2);
        expect(out[1].kind).toBe('group');
        expect(out.slice(4).map((e) => e.label)).toEqual(['Zed', 'Abc']);
    });

    it('skips stale MRU ids and caps recents at MRU_LIMIT', () => {
        const items = Array.from({ length: MRU_LIMIT + 3 }, (_, i) => bm({ id: i + 1, name: `B${i + 1}` }));
        const groups = [group('G', items)];
        // MRU references a stale id (999) plus more than MRU_LIMIT valid ids.
        const mru: MruEntry[] = [{ id: 999, count: 1, ts: 999 }, ...items.map((b, i) => ({ id: b.id, count: 1, ts: i }))];

        const out = buildPaletteEntries(groups, mru, []);
        const recents = out.filter((e) => e.isRecent);
        expect(recents).toHaveLength(MRU_LIMIT);
        expect(recents.every((e) => e.bookmark?.id !== 999)).toBe(true);
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

describe('applyMruMany', () => {
    it('records every id with a single timestamp', () => {
        const r = applyMruMany([], [3, 5], 1000);
        expect(r).toEqual([
            { id: 3, count: 1, ts: 1000 },
            { id: 5, count: 1, ts: 1000 },
        ]);
    });
    it('increments existing ids and appends new ones', () => {
        const start: MruEntry[] = [{ id: 1, count: 1, ts: 100 }];
        const r = applyMruMany(start, [1, 2], 300);
        const byId = Object.fromEntries(r.map((e) => [e.id, e]));
        expect(byId[1]).toEqual({ id: 1, count: 2, ts: 300 });
        expect(byId[2]).toEqual({ id: 2, count: 1, ts: 300 });
    });
    it('counts duplicate ids in the batch', () => {
        const r = applyMruMany([], [7, 7, 7], 500);
        expect(r).toEqual([{ id: 7, count: 3, ts: 500 }]);
    });
    it('matches folding applyMru over the ids', () => {
        const ids = [4, 1, 4, 2];
        const many = applyMruMany([], ids, 900);
        let folded: MruEntry[] = [];
        for (const id of ids) folded = applyMru(folded, id, 900);
        expect(many).toEqual(folded);
    });
    it('ignores 0 ids and truncates to MRU_MAX_ENTRIES', () => {
        const start: MruEntry[] = Array.from({ length: MRU_MAX_ENTRIES }, (_, i) => ({
            id: i + 1,
            count: 1,
            ts: i,
        }));
        const r = applyMruMany(start, [0, 999], MRU_MAX_ENTRIES + 10);
        expect(r).toHaveLength(MRU_MAX_ENTRIES);
        expect(r[0].id).toBe(999);
    });
    it('does not mutate the input list', () => {
        const start: MruEntry[] = [{ id: 1, count: 1, ts: 100 }];
        applyMruMany(start, [1, 2], 300);
        expect(start).toEqual([{ id: 1, count: 1, ts: 100 }]);
    });
});
