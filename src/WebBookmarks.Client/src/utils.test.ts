// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeUrl, escapeHtml, openUrls } from './utils';

// Locks in the XSS guard (fix from ace0af7 / #4): dangerous URL schemes must be
// neutralized to about:blank, including control-character bypass payloads, while
// safe URLs pass through untouched.
describe('sanitizeUrl', () => {
    it('neutralizes dangerous schemes to about:blank', () => {
        for (const url of [
            'javascript:alert(1)',
            'JavaScript:alert(1)',
            '  javascript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox(1)',
        ]) {
            expect(sanitizeUrl(url)).toBe('about:blank');
        }
    });

    it('neutralizes control-character bypass payloads', () => {
        expect(sanitizeUrl('java\tscript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('java\nscript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrl('\u0000javascript:alert(1)')).toBe('about:blank');
    });

    it('leaves safe and relative URLs untouched', () => {
        for (const url of [
            'https://example.com',
            'http://example.com/path?q=1',
            'mailto:a@b.com',
            '/relative/path',
            'tel:+15551234567',
        ]) {
            expect(sanitizeUrl(url)).toBe(url);
        }
    });

    it('handles empty / nullish input safely', () => {
        expect(sanitizeUrl('')).toBe('');
        expect(sanitizeUrl(undefined as unknown as string)).toBe('');
    });
});

// Fix (audit R4 / #40): multi-open must open the non-final URLs synchronously
// inside the click gesture so popup blockers don't drop the extra tabs. The last
// URL navigates the current tab.
describe('openUrls (multi-open, same tab)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('opens all-but-last synchronously and navigates to the last', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const setHref = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                get href() {
                    return 'https://self.example';
                },
                set href(v: string) {
                    setHref(v);
                },
            },
        });

        openUrls(
            [
                { name: 'a', url: 'https://a.example' },
                { name: 'b', url: 'https://b.example' },
                { name: 'c', url: 'https://c.example' },
            ],
            false,
        );

        expect(open).toHaveBeenCalledTimes(2);
        expect(open).toHaveBeenNthCalledWith(1, 'https://a.example', '_blank', 'noopener');
        expect(open).toHaveBeenNthCalledWith(2, 'https://b.example', '_blank', 'noopener');
        expect(setHref).toHaveBeenCalledWith('https://c.example');
    });
});

describe('escapeHtml', () => {
    it('escapes HTML-significant characters', () => {
        expect(escapeHtml('<script>"&\'</script>')).toBe(
            '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;',
        );
    });

    it('leaves plain text untouched', () => {
        expect(escapeHtml('hello world 123')).toBe('hello world 123');
    });
});
