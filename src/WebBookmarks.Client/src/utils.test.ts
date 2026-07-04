// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeUrl, escapeHtml } from './utils';

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
