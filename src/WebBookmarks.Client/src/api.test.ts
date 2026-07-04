import { describe, it, expect } from 'vitest';
import { isRetryable, HttpError, inBulkChunks, MAX_BULK_ITEMS } from './api';

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

