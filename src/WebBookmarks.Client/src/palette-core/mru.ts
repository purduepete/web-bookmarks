import type { MruEntry } from './types';

export const MRU_LIMIT = 5;
export const MRU_MAX_ENTRIES = 50;

// Records a use of `id` against an existing MRU list and returns the updated
// list: increments the count (or appends), stamps `now`, re-sorts by frecency
// (recency first, then count), and truncates to MRU_MAX_ENTRIES. Pure — the
// caller owns persistence. Returns the input unchanged (a copy) when id is 0.
export function applyMru(list: MruEntry[], id: number, now: number): MruEntry[] {
    if (!id) return [...list];
    const next = list.map((e) => ({ ...e }));
    const idx = next.findIndex((e) => e.id === id);
    if (idx >= 0) {
        next[idx].count += 1;
        next[idx].ts = now;
    } else {
        next.push({ id, count: 1, ts: now });
    }
    next.sort((a, b) => b.ts - a.ts || b.count - a.count);
    if (next.length > MRU_MAX_ENTRIES) next.length = MRU_MAX_ENTRIES;
    return next;
}
