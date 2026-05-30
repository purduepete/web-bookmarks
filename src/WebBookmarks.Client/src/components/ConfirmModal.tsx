import { useEffect, useRef } from 'react';

interface Props {
    message: string;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    message,
    title = 'Confirm',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: Props) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        confirmRef.current?.focus();
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm, onCancel]);

    return (
        <div
            className="modal-backdrop-custom"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div className="modal-content-custom modal-confirm">
                <div className="modal-header-custom">
                    <span>{title}</span>
                    <button className="modal-close-btn" onClick={onCancel}>
                        ×
                    </button>
                </div>
                <div className="modal-body-custom">
                    <p className="confirm-message">{message}</p>
                </div>
                <div className="modal-footer-custom">
                    <button className="btn-modal btn-modal-cancel" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmRef}
                        className={`btn-modal ${danger ? 'btn-modal-danger' : 'btn-modal-save'}`}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
