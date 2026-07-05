import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isRetryable,
    HttpError,
    inBulkChunks,
    MAX_BULK_ITEMS,
    validateApiKey,
    validateBulkItem,
    hasUnsafeScheme,
    bulkCreateBookmarks,
} from './api';
import type { WebBookmarksItem } from './types';

function makeItem(overrides: Partial<Omit<WebBookmarksItem, 'id'>> = {}): Omit<WebBookmarksItem, 'id'> {
    return {
        name: 'Example',
        url: 'https://example.com',
        urls: '',
        shortcut: '',
        description: '',
        isVisible: true,
        bookmarkGroup: 'Group',
        sortOrder: 0,
        profile: 'home',
        isFavorite: false,
        ...overrides,
    };
}

// Locks in the transient-only retry policy (fix from #23 / R4): the retry loop
// must retry timeouts, network failures and transient 5xx, but NEVER 4xx
// (auth/validation) or deterministic errors that won't recover.
describe('isRetryable', () => {
    it('retries transient HTTP statuses', () => {
        for (const status of [408, 429, 500, 502, 503, 504]) {
            expect(isRetryable(new HttpError(status, 'x'))).toBe(true);
        }
    });

    it('does not retry non-transient 4xx statuses', () => {
        for (const status of [400, 401, 403, 404, 409, 422]) {
            expect(isRetryable(new HttpError(status, 'x'))).toBe(false);
        }
    });

    it('does not retry a surfaced Unauthorized error', () => {
        expect(isRetryable(new Error('Unauthorized'))).toBe(false);
    });

    it('retries request timeouts (AbortError)', () => {
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        expect(isRetryable(abort)).toBe(true);
    });

    it('retries genuine network failures (TypeError)', () => {
        expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('does not retry deterministic errors (e.g. invalid JSON / bugs)', () => {
        expect(isRetryable(new SyntaxError('Unexpected token'))).toBe(false);
        expect(isRetryable(new RangeError('boom'))).toBe(false);
        expect(isRetryable(null)).toBe(false);
        expect(isRetryable('nope')).toBe(false);
    });
});

// Locks in the transparent bulk-batching (R1 + R3): no bulk operation can ever
// exceed the API's MaxBulkItems cap, regardless of caller, because chunking
// lives in the api layer. Covers the >1000-item case that used to fail.
describe('inBulkChunks', () => {
    it('sends a single chunk when within the cap', async () => {
        const calls: number[][] = [];
        const items = Array.from({ length: MAX_BULK_ITEMS }, (_, i) => i);
        await inBulkChunks(items, async (chunk) => {
            calls.push(chunk);
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(MAX_BULK_ITEMS);
    });

    it('splits an over-cap input into <=MAX_BULK_ITEMS chunks', async () => {
        const sizes: number[] = [];
        const items = Array.from({ length: 2 * MAX_BULK_ITEMS + 250 }, (_, i) => i);
        const results = await inBulkChunks(items, async (chunk) => {
            sizes.push(chunk.length);
            return chunk.length;
        });
        expect(sizes).toEqual([MAX_BULK_ITEMS, MAX_BULK_ITEMS, 250]);
        expect(results).toEqual([MAX_BULK_ITEMS, MAX_BULK_ITEMS, 250]);
        // Every element is covered exactly once, in order.
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(items.length);
    });

    it('invokes fn once for empty input (preserves single-request semantics)', async () => {
        let calls = 0;
        await inBulkChunks<number, void>([], async () => {
            calls++;
        });
        expect(calls).toBe(1);
    });
});

// Locks in Rob1 (#51): a bulk import must be validated in FULL before any chunk is
// sent, so an import the API would reject writes nothing (otherwise early chunks
// commit and a retry silently duplicates them).
describe('validateBulkItem / hasUnsafeScheme', () => {
    it('accepts a valid item', () => {
        expect(validateBulkItem(makeItem())).toBeNull();
    });

    it('rejects a missing/blank name', () => {
        expect(validateBulkItem(makeItem({ name: '' }))).toMatch(/Name is required/);
        expect(validateBulkItem(makeItem({ name: '   ' }))).toMatch(/Name is required/);
    });

    it('enforces the field length caps', () => {
        expect(validateBulkItem(makeItem({ name: 'a'.repeat(201) }))).toMatch(/200/);
        expect(validateBulkItem(makeItem({ url: 'https://x/' + 'a'.repeat(2048) }))).toMatch(/2048/);
        expect(validateBulkItem(makeItem({ bookmarkGroup: 'g'.repeat(201) }))).toMatch(/Group/);
    });

    it('blocks dangerous URL schemes, including whitespace-obfuscated ones', () => {
        expect(hasUnsafeScheme('javascript:alert(1)')).toBe(true);
        expect(hasUnsafeScheme('JAVASCRIPT:alert(1)')).toBe(true);
        expect(hasUnsafeScheme('java\tscript:alert(1)')).toBe(true);
        expect(hasUnsafeScheme('  data:text/html,x')).toBe(true);
        expect(hasUnsafeScheme('vbscript:msgbox')).toBe(true);
        expect(hasUnsafeScheme('https://example.com')).toBe(false);
        expect(hasUnsafeScheme('')).toBe(false);
        expect(hasUnsafeScheme(null)).toBe(false);
        expect(validateBulkItem(makeItem({ url: 'javascript:alert(1)' }))).toMatch(/disallowed scheme/);
    });

    it('rejects the whole import before any request when an item is invalid', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const items = [makeItem(), makeItem({ name: '', url: 'javascript:alert(1)' })];
        await expect(bulkCreateBookmarks(items)).rejects.toThrow(/Bookmark 2/);
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

// Locks in the RB1 fix (#32): validateApiKey must report `false` ONLY for a real
// auth rejection (401/403). A network/timeout/5xx failure must NOT be reported as
// an invalid key (which would clear a valid key / block sign-in) — it is retried
// and then re-thrown so the login gate can distinguish "wrong key" from "offline".
describe('validateApiKey', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns true for a 2xx response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);
        await expect(validateApiKey('good')).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns false for an auth rejection (401/403) without retrying', async () => {
        for (const status of [401, 403]) {
            const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
            vi.stubGlobal('fetch', fetchMock);
            await expect(validateApiKey('bad')).resolves.toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        }
    });

    it('throws (not false) on a persistent network failure', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);
        const assertion = expect(validateApiKey('valid-but-offline')).rejects.toBeInstanceOf(TypeError);
        await vi.runAllTimersAsync();
        await assertion;
        // retried, not treated as a verdict on the key
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    it('recovers a valid key after a transient blip (retries then succeeds)', async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);
        const assertion = expect(validateApiKey('valid')).resolves.toBe(true);
        await vi.runAllTimersAsync();
        await assertion;
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('re-throws a non-auth HTTP error (e.g. 500) instead of returning false', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        vi.stubGlobal('fetch', fetchMock);
        const assertion = expect(validateApiKey('valid')).rejects.toBeInstanceOf(HttpError);
        await vi.runAllTimersAsync();
        await assertion;
    });
});

