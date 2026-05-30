import { useEffect, useRef, useState } from 'react';

interface Props {
    message: string;
    title?: string;
    placeholder?: string;
    initialValue?: string;
    submitLabel?: string;
    cancelLabel?: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}

export default function PromptModal({
    message,
    title = 'Enter a command',
    placeholder = '',
    initialValue = '',
    submitLabel = 'Go',
    cancelLabel = 'Cancel',
    onSubmit,
    onCancel,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

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
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit(value);
                    }}
                >
                    <div className="modal-body-custom">
                        <div className="modal-field">
                            <label>{message}</label>
                            <input
                                ref={inputRef}
                                type="text"
                                className="form-control"
                                placeholder={placeholder}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="modal-footer-custom">
                        <button type="button" className="btn-modal btn-modal-cancel" onClick={onCancel}>
                            {cancelLabel}
                        </button>
                        <button type="submit" className="btn-modal btn-modal-save">
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
