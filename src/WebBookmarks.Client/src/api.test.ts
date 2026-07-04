import { describe, it, expect } from 'vitest';
import { isRetryable, HttpError } from './api';

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
