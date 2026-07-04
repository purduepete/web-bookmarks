// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setLocalBookmarks, getLocalBookmarks } from './bookmarkCache';
import type { WebBookmarksItem } from '../types';

const item = (name: string): WebBookmarksItem =>
    ({ name, url: `https://example.com/${name}` }) as unknown as WebBookmarksItem;

// jsdom under this vitest setup doesn't expose a working localStorage, so back it
// with a simple in-memory Storage for these tests.
function makeStorage(): Storage {
    const map = new Map<string, string>();
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => void map.set(k, String(v)),
        removeItem: (k: string) => void map.delete(k),
        key: (i: number) => [...map.keys()][i] ?? null,
    };
}

describe('setLocalBookmarks', () => {
    beforeEach(() => vi.stubGlobal('localStorage', makeStorage()));
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('writes the profile cache and drops the legacy key', () => {
        localStorage.setItem('bookmarks', '[]');
        setLocalBookmarks('home', [item('a')]);
        expect(getLocalBookmarks('home')).toEqual([item('a')]);
        expect(localStorage.getItem('bookmarks')).toBeNull();
    });

    // Fix (audit R1 / #37): a full or disabled localStorage must not throw, or the
    // fetch success path would reject and surface an error over freshly-loaded data.
    it('swallows a QuotaExceededError instead of throwing', () => {
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });
        expect(() => setLocalBookmarks('home', [item('a')])).not.toThrow();
    });
});
