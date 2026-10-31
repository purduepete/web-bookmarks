import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFirstLoad } from './useFirstLoad';

vi.mock('react', () => ({ useLayoutEffect: (effect: () => void) => effect() }));
const dataset: { firstLoad: string } = { firstLoad: 'pending' };
beforeEach(() => {
    vi.useFakeTimers();
    dataset.firstLoad = 'pending';
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('window', { setTimeout });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
it('waits for the initial list and profiles and keeps the shell visible on refresh', () => {
    useFirstLoad(false, false);
    expect(dataset.firstLoad).toBe('pending');
    useFirstLoad(true, false);
    expect(dataset.firstLoad).toBe('ready');
    vi.advanceTimersByTime(600);
    expect(dataset.firstLoad).toBe('complete');
    useFirstLoad(false, false);
    expect(dataset.firstLoad).toBe('complete');
});
it('reveals errors and sign-in without replaying the shell on retry', () => {
    useFirstLoad(false, true);
    expect(dataset.firstLoad).toBe('error');
    useFirstLoad(false, false);
    expect(dataset.firstLoad).toBe('error');
});
