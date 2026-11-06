// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import indexHtml from '../index.html?raw';
import favicon from '../public/favicon.svg?raw';
import darkSource from '../public/apple-touch-icon.svg?raw';
import lightSource from '../public/apple-touch-icon-light.svg?raw';
import darkPng from '../public/apple-touch-icon.png?inline';
import lightPng from '../public/apple-touch-icon-light.png?inline';
import { SITE_ICONS, trackSiteIcon } from './siteIcon';

function mockDeviceTheme(light: boolean) {
    const listeners = new Set<() => void>();
    const media = {
        matches: light,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => media),
    );
    return {
        listeners,
        change(next: boolean) {
            media.matches = next;
            listeners.forEach((fn) => fn());
        },
    };
}

// Width and height from a PNG data URL's IHDR chunk (bytes 16-23).
function pngSize(dataUrl: string) {
    const bytes = atob(dataUrl.split(',')[1]);
    const word = (at: number) =>
        [0, 1, 2, 3].reduce((n, i) => n * 256 + bytes.charCodeAt(at + i), 0);
    return [word(16), word(20)];
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
});

describe('site icon', () => {
    it('follows the device light/dark setting and stops when untracked', () => {
        document.head.innerHTML = '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">';
        const link = document.querySelector('link[rel="apple-touch-icon"]')!;
        const device = mockDeviceTheme(true);
        const stop = trackSiteIcon();
        expect(link.getAttribute('href')).toBe(SITE_ICONS.light);
        device.change(false);
        expect(link.getAttribute('href')).toBe(SITE_ICONS.dark);
        device.change(true);
        expect(link.getAttribute('href')).toBe(SITE_ICONS.light);
        stop();
        expect(device.listeners.size).toBe(0);
    });

    it('ships a dark favicon and 180px light and dark site icons', () => {
        expect(indexHtml).toContain(
            '<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />',
        );
        expect(indexHtml).toContain(
            '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />',
        );
        expect(favicon).toContain('<rect width="32" height="32" rx="6" fill="#020617"/>');
        expect(darkSource).toContain('fill="#020617"');
        expect(lightSource).toContain('fill="#fff7ed"');
        expect(pngSize(darkPng)).toEqual([180, 180]);
        expect(pngSize(lightPng)).toEqual([180, 180]);
    });
});
