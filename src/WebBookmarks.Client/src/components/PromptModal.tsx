import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { focusModalInput, isIOSDevice } from '../lib/modalFocus';

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
        focusModalInput(inputRef.current);
        if (!isIOSDevice()) inputRef.current?.select();
    }, []);

    return (
        <Modal title={title} onClose={onCancel} contentClassName="modal-confirm">
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
        </Modal>
    );
}
