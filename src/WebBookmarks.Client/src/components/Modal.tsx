import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { isIOSDevice } from '../lib/modalFocus';

interface Props {
    title: string;
    onClose: () => void;
    children: ReactNode;
    // Extra class for the content box, e.g. "modal-wide" or "modal-confirm".
    contentClassName?: string;
    // Keep Tab/Shift+Tab cycling within the modal. Defaults to true.
    trapFocus?: boolean;
}

// Shared modal shell: backdrop (click-out to close), Escape-to-close, an
// optional focus trap, and the standard header with a close button. Callers
// supply the body and footer as children.
export default function Modal({
    title,
    onClose,
    children,
    contentClassName,
    trapFocus = true,
}: Props) {
    const backdropRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
        const previousFocus = document.activeElement;
        if (isIOSDevice()) closeRef.current?.focus({ preventScroll: true });
        return () => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (!trapFocus || e.key !== 'Tab') return;

            const modal = backdropRef.current;
            if (!modal) return;

            const focusable = modal.querySelectorAll<HTMLElement>(
                'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first || document.activeElement === modal) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, trapFocus]);

    return (
        <div
            className="modal-backdrop-custom"
            ref={backdropRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`modal-content-custom${contentClassName ? ` ${contentClassName}` : ''}`}
            >
                <div className="modal-header-custom">
                    <span>{title}</span>
                    <button
                        ref={closeRef}
                        type="button"
                        aria-label="Close"
                        className="modal-close-btn"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
