import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PromptModal from './PromptModal';
import Modal from './Modal';
import { focusModalInput, focusPageInput } from '../lib/modalFocus';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('modal-open focus', () => {
    it.each([
        ['desktop', 'Windows', 'Win32', 0, false],
        ['iPhone', 'iPhone', 'iPhone', 5, true],
        ['iPad', 'iPad', 'iPad', 5, true],
        ['desktop-UA iPad', 'Macintosh', 'MacIntel', 5, true],
        ['Mac desktop', 'Macintosh', 'MacIntel', 0, false],
    ])('preserves editing, trapping and restoration on %s', (_name, ua, platform, touches, ios) => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('navigator', { userAgent: ua, platform, maxTouchPoints: touches });
        const trigger = document.createElement('button');
        const host = document.createElement('div');
        document.body.append(trigger, host);
        trigger.focus();
        const root = createRoot(host);
        act(() =>
            root.render(
                <PromptModal
                    message="Shortcut"
                    initialValue="test"
                    onSubmit={vi.fn()}
                    onCancel={vi.fn()}
                />,
            ),
        );
        const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
        const input = host.querySelector('input')!;
        expect(document.activeElement).toBe(ios ? dialog : input);
        const landingInput = document.createElement('input');
        document.body.append(landingInput);
        focusPageInput(landingInput);
        expect(document.activeElement).toBe(ios ? dialog : input);
        input.focus();
        act(() => {
            input.value = 'manual';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(document.activeElement).toBe(input);
        const buttons = host.querySelectorAll('button');
        buttons[buttons.length - 1].focus();
        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        act(() => document.dispatchEvent(tab));
        expect(tab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(buttons[0]);
        act(() => root.unmount());
        expect(document.activeElement).toBe(trigger);
        focusPageInput(landingInput);
        expect(document.activeElement).toBe(landingInput);
    });

    it('focuses Close for dialogs without an initial input and permits contenteditable focus', () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        act(() =>
            root.render(
                <Modal title="Editor" onClose={vi.fn()}>
                    <div contentEditable tabIndex={0} />
                </Modal>,
            ),
        );
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
        host.querySelector<HTMLElement>('[contenteditable]')!.focus();
        expect(document.activeElement?.hasAttribute('contenteditable')).toBe(true);
        focusModalInput(null);
        act(() => root.unmount());
    });
});
