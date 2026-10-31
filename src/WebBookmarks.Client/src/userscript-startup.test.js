// @vitest-environment node
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bundle = readFileSync(
    new URL('../../../tampermonkey/webbookmarks-palette.user.js', import.meta.url),
    'utf8',
);
const header = readFileSync(
    new URL('../../../tampermonkey/src/header.txt', import.meta.url),
    'utf8',
);
const pages = [];
const bookmark = {
    id: 1,
    name: 'Slow page bookmark',
    url: 'https://example.com',
    isVisible: true,
    bookmarkGroup: 'Test',
    profile: 'home',
};

function page({
    root = true,
    body = false,
    cached = false,
    ua = 'Windows',
    platform = 'Win32',
    touches = 0,
} = {}) {
    const dom = new JSDOM('<!doctype html><html></html>', {
        url: 'https://example.com',
        runScripts: 'outside-only',
    });
    pages.push(dom);
    const { window } = dom;
    Object.defineProperties(window.navigator, {
        userAgent: { value: ua },
        platform: { value: platform },
        maxTouchPoints: { value: touches },
    });
    if (!body) window.document.body.remove();
    window.document.head.remove();
    if (!root) window.document.documentElement.remove();

    const requests = [];
    const observers = [];
    const menus = [];
    const values = new Map(cached ? [['bookmarks_home', [bookmark]]] : []);
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
        constructor(callback) {
            super(callback);
            this.disconnect = vi.fn(() => NativeObserver.prototype.disconnect.call(this));
            observers.push(this);
        }
    };
    Object.assign(window, {
        GM_getValue: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
        GM_setValue: (key, value) => values.set(key, value),
        GM_xmlhttpRequest: (options) => requests.push(options),
        GM_registerMenuCommand: (label, callback) => menus.push({ label, callback }),
        GM_openInTab: vi.fn(),
        matchMedia: () => ({ matches: false }),
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.eval(bundle);

    return {
        window,
        requests,
        observers,
        menus,
        host: () => window.document.getElementById('wbp-shadow-host'),
        key(key = '/', code = 'Slash') {
            window.dispatchEvent(
                new window.KeyboardEvent('keydown', {
                    key,
                    code,
                    ctrlKey: key === '/',
                    altKey: key === '/',
                    bubbles: true,
                    composed: true,
                    cancelable: true,
                }),
            );
        },
    };
}

afterEach(() => {
    for (const dom of pages.splice(0)) dom.window.close();
});

describe('userscript startup during page loading', () => {
    it('keeps the initially focused palette container free of a browser outline', () => {
        expect(bundle).toMatch(/\.wbp-container:focus\s*\{\s*outline: none;/);
        const css = readFileSync(new URL('./App.css', import.meta.url), 'utf8');
        expect(css).toMatch(
            /\.palette-container\[tabindex='-1'\]:focus,\s*\.modal-backdrop-custom\[tabindex='-1'\]:focus\s*\{\s*outline: none;/,
        );
        expect(css).not.toMatch(/input:focus\s*\{\s*outline: none;/);
    });

    it.each([
        ['desktop', 'Windows', 'Win32', 0, 'wbp-input'],
        ['iPhone', 'iPhone', 'iPhone', 5, 'wbp-container'],
        ['iPad', 'iPad', 'iPad', 5, 'wbp-container'],
        ['desktop-UA iPad', 'Macintosh', 'MacIntel', 5, 'wbp-container'],
    ])(
        'opens safely on %s and allows explicit input focus',
        (_name, ua, platform, touches, expected) => {
            const p = page({ ua, platform, touches, cached: true });
            p.key();
            const shadow = p.host().shadowRoot;
            expect(shadow.activeElement.className).toBe(expected);
            const input = shadow.querySelector('.wbp-input');
            input.focus();
            expect(shadow.activeElement).toBe(input);
        },
    );

    it('ships document-start timing and the menu grant in source and bundle metadata', () => {
        expect(bundle.startsWith(header.trimEnd())).toBe(true);
        for (const text of [header, bundle]) {
            expect(text).toMatch(/@version\s+\d+\.\d+\.\d+(?:\r?\n|$)/);
            expect(text).toMatch(/@run-at\s+document-start/);
            expect(text).toMatch(/@grant\s+GM_registerMenuCommand/);
        }
    });

    it('registers the menu and shortcut before any document root exists', () => {
        const p = page({ root: false });
        expect(p.menus[0].label).toBe('Open WebBookmarks Palette');
        p.key();
        expect(p.observers).toHaveLength(1);
        expect(p.host()).toBeNull();
    });

    it('opens when the root arrives without waiting for a head, body or page load', async () => {
        const p = page({ root: false });
        p.key();
        const root = p.window.document.createElement('html');
        p.window.document.appendChild(root);
        await Promise.resolve();
        expect(p.observers[0].disconnect).toHaveBeenCalledOnce();
        expect(p.host().parentNode).toBe(root);
        expect(p.window.document.head).toBeNull();
        expect(p.window.document.body).toBeNull();
        expect(p.host().shadowRoot.textContent).toContain('Loading');
        expect(p.host().shadowRoot.activeElement.className).toBe('wbp-input');
    });

    it('cancels a queued open on the second shortcut and disconnects the observer', async () => {
        const p = page({ root: false });
        p.key();
        p.key();
        p.window.document.appendChild(p.window.document.createElement('html'));
        await Promise.resolve();
        expect(p.observers).toHaveLength(1);
        expect(p.observers[0].disconnect).toHaveBeenCalledOnce();
        expect(p.host()).toBeNull();
        p.key();
        expect(p.host()).not.toBeNull();
    });

    it('queues repeated menu opens once and opens only one host after root arrival', async () => {
        const p = page({ root: false });
        p.menus[0].callback();
        p.menus[0].callback();
        p.window.document.appendChild(p.window.document.createElement('html'));
        await Promise.resolve();
        expect(p.observers).toHaveLength(1);
        expect(p.window.document.querySelectorAll('#wbp-shadow-host')).toHaveLength(1);
    });

    it('shows and focuses the loading palette while bookmark requests remain pending', () => {
        const p = page();
        p.key();
        expect(p.requests.length).toBeGreaterThan(0);
        expect(p.host().shadowRoot.textContent).toContain('Loading');
        expect(p.host().shadowRoot.activeElement.className).toBe('wbp-input');
        expect(p.window.document.documentElement.querySelector('style').textContent).toContain(
            '@font-face',
        );
    });

    it('shows cached bookmarks before a slow refresh returns', () => {
        const p = page({ cached: true });
        p.key();
        expect(p.host().shadowRoot.textContent).toContain(bookmark.name);
        expect(p.host().shadowRoot.textContent).not.toContain('Loading');
        expect(p.requests.length).toBeGreaterThan(0);
    });

    it('keeps one connected palette through body creation and replacement', () => {
        const p = page({ cached: true });
        p.key();
        const host = p.host();
        const root = p.window.document.documentElement;
        root.appendChild(p.window.document.createElement('body'));
        p.window.document.body.replaceWith(p.window.document.createElement('body'));
        expect(host.parentNode).toBe(root);
        expect(host.isConnected).toBe(true);
        expect(p.window.document.querySelectorAll('#wbp-shadow-host')).toHaveLength(1);
    });

    it('reattaches a detached palette on the shortcut or menu', () => {
        const p = page({ cached: true });
        p.key();
        const host = p.host();
        host.remove();
        p.key();
        expect(p.host()).toBe(host);
        expect(host.shadowRoot.activeElement.className).toBe('wbp-input');
        host.remove();
        p.menus[0].callback();
        expect(p.host()).toBe(host);
    });

    it('still toggles and closes with Escape, without duplicating the font style', () => {
        const p = page({ cached: true });
        p.key();
        p.key();
        expect(p.host()).toBeNull();
        p.menus[0].callback();
        p.key('Escape', 'Escape');
        expect(p.host()).toBeNull();
        expect(p.window.document.documentElement.querySelectorAll(':scope > style')).toHaveLength(
            1,
        );
    });
});
