import { useEffect, useRef } from 'react';
import Modal from './Modal';

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

    // Modal handles Escape (→ onCancel); we only add Enter → confirm here.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm]);

    return (
        <Modal title={title} onClose={onCancel} contentClassName="modal-confirm">
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
        </Modal>
    );
}
