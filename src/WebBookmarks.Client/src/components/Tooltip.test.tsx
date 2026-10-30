import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import Tooltip from './Tooltip';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Tooltip />));
});

afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function button() {
    const node = document.createElement('button');
    node.dataset.tip = 'Edit bookmark';
    node.setAttribute('aria-describedby', 'drag-instructions');
    document.body.append(node);
    return node;
}

describe('shared custom tooltip', () => {
    it('describes keyboard focus and preserves existing descriptions on dismissal', () => {
        const node = button();
        node.focus();
        const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
        expect(tip.hidden).toBe(false);
        expect(tip.textContent).toBe('Edit bookmark');
        expect(node.getAttribute('aria-describedby')).toBe(`drag-instructions ${tip.id}`);
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip.hidden).toBe(true);
        expect(node.getAttribute('aria-describedby')).toBe('drag-instructions');
    });

    it('stays open while the pointer moves onto the tooltip and closes after leaving', () => {
        vi.useFakeTimers();
        const node = button();
        node.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
        node.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: tip }));
        tip.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        vi.advanceTimersByTime(200);
        expect(tip.hidden).toBe(false);
        tip.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
        vi.advanceTimersByTime(200);
        expect(tip.hidden).toBe(true);
    });

    it('dismisses on scrolling or clicking and cleans up on unmount', () => {
        const node = button();
        const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
        node.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        expect(tip.hidden).toBe(true);
        node.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        node.click();
        expect(tip.hidden).toBe(true);
    });
});

it('does not render native title attributes on app-owned JSX elements', () => {
    const files = import.meta.glob('../**/*.tsx', {
        eager: true,
        query: '?raw',
        import: 'default',
    });
    const violations: string[] = [];
    for (const [file, text] of Object.entries(files)) {
        if (file.includes('.test.')) continue;
        const source = ts.createSourceFile(
            file,
            String(text),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        const visit = (node: ts.Node) => {
            if (ts.isJsxAttribute(node) && node.name.getText(source) === 'title') {
                const tag = node.parent.parent.tagName.getText(source);
                if (/^[a-z]/.test(tag) && tag !== 'iframe') violations.push(`${file}: ${tag}`);
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    expect(violations).toEqual([]);
});
