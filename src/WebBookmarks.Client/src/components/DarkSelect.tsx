import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export default function DarkSelect({ value, options, onChange, placeholder, className }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; flip: boolean }>({ top: 0, left: 0, width: 0, flip: false });

    const updatePos = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const maxH = 260;
        const spaceBelow = window.innerHeight - rect.bottom - 4;
        const flip = spaceBelow < maxH && rect.top > spaceBelow;
        setPos({
            top: flip ? rect.top - 4 : rect.bottom + 2,
            left: rect.left,
            width: Math.max(rect.width, 180),
            flip,
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePos();
        const handleClick = (e: MouseEvent) => {
            if (
                ref.current && !ref.current.contains(e.target as Node) &&
                listRef.current && !listRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        const handleScroll = () => updatePos();
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [open, updatePos]);

    // Scroll selected item into view when opening
    useEffect(() => {
        if (open && listRef.current) {
            const active = listRef.current.querySelector('.dark-select-option-active');
            if (active) active.scrollIntoView({ block: 'nearest' });
        }
    }, [open]);

    const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? '';

    return (
        <div className={`dark-select ${className ?? ''}`} ref={ref}>
            <button
                type="button"
                className="dark-select-trigger"
                ref={triggerRef}
                onClick={() => setOpen(!open)}
            >
                <span className="dark-select-value">{selectedLabel}</span>
                <svg className="dark-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open && createPortal(
                <div
                    className="dark-select-list"
                    ref={listRef}
                    style={{
                        position: 'fixed',
                        top: pos.flip ? undefined : pos.top,
                        bottom: pos.flip ? window.innerHeight - pos.top : undefined,
                        left: pos.left,
                        width: pos.width,
                    }}
                >
                    {options.map((o) => (
                        <div
                            key={o.value}
                            className={`dark-select-option${o.value === value ? ' dark-select-option-active' : ''}`}
                            onClick={() => {
                                onChange(o.value);
                                setOpen(false);
                            }}
                        >
                            {o.value === value && (
                                <svg className="dark-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                            <span>{o.label}</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}
