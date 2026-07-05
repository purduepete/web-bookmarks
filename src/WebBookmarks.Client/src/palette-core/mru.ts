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

// Batch form of applyMru: records every id in `ids` against the list with a single
// `now`, then re-sorts and truncates once. Equivalent to folding applyMru over the
// ids but without re-reading/re-writing storage per item — the caller persists the
// result once. Duplicate ids increment the count multiple times; 0 ids are ignored.
export function applyMruMany(list: MruEntry[], ids: number[], now: number): MruEntry[] {
    const next = list.map((e) => ({ ...e }));
    const byId = new Map<number, MruEntry>(next.map((e) => [e.id, e]));
    for (const id of ids) {
        if (!id) continue;
        const existing = byId.get(id);
        if (existing) {
            existing.count += 1;
            existing.ts = now;
        } else {
            const entry = { id, count: 1, ts: now };
            next.push(entry);
            byId.set(id, entry);
        }
    }
    next.sort((a, b) => b.ts - a.ts || b.count - a.count);
    if (next.length > MRU_MAX_ENTRIES) next.length = MRU_MAX_ENTRIES;
    return next;
}
