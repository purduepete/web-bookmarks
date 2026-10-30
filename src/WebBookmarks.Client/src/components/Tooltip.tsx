import { useEffect, useId } from 'react';

export default function Tooltip() {
    const id = useId();
    useEffect(() => {
        const tip = document.createElement('div');
        tip.id = id;
        tip.className = 'app-tooltip';
        tip.setAttribute('role', 'tooltip');
        tip.hidden = true;
        document.body.append(tip);
        let target: HTMLElement | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const hide = () => {
            clearTimeout(timer);
            if (target) {
                const descriptions = (target.getAttribute('aria-describedby') ?? '')
                    .split(/\s+/)
                    .filter((value) => value && value !== id);
                if (descriptions.length)
                    target.setAttribute('aria-describedby', descriptions.join(' '));
                else target.removeAttribute('aria-describedby');
            }
            target = null;
            tip.hidden = true;
        };
        const show = (next: HTMLElement) => {
            const text = next.dataset.tip;
            if (!text) return;
            clearTimeout(timer);
            if (target !== next) hide();
            target = next;
            tip.textContent = text;
            tip.hidden = false;
            const descriptions = new Set(
                (next.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
            );
            descriptions.add(id);
            next.setAttribute('aria-describedby', [...descriptions].join(' '));
            const box = next.getBoundingClientRect();
            const bounds = tip.getBoundingClientRect();
            tip.style.left = `${Math.max(8, Math.min(box.left + box.width / 2 - bounds.width / 2, innerWidth - bounds.width - 8))}px`;
            const top =
                box.bottom + 6 + bounds.height <= innerHeight - 8
                    ? box.bottom + 6
                    : box.top - bounds.height - 6;
            tip.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
        };
        const trigger = (node: EventTarget | null) =>
            node instanceof Element ? node.closest<HTMLElement>('[data-tip]') : null;
        const over = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return;
            if (event.target instanceof Node && tip.contains(event.target)) clearTimeout(timer);
            else {
                const next = trigger(event.target);
                if (next) show(next);
            }
        };
        const out = (event: PointerEvent) => {
            const next = event.relatedTarget;
            if (next instanceof Node && (target?.contains(next) || tip.contains(next))) return;
            clearTimeout(timer);
            timer = setTimeout(hide, 150);
        };
        const focus = (event: FocusEvent) => {
            const next = trigger(event.target);
            if (next) show(next);
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') hide();
        };
        document.addEventListener('pointerover', over);
        document.addEventListener('pointerout', out);
        document.addEventListener('focusin', focus);
        document.addEventListener('focusout', hide);
        document.addEventListener('click', hide, true);
        document.addEventListener('keydown', key);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            hide();
            tip.remove();
            document.removeEventListener('pointerover', over);
            document.removeEventListener('pointerout', out);
            document.removeEventListener('focusin', focus);
            document.removeEventListener('focusout', hide);
            document.removeEventListener('click', hide, true);
            document.removeEventListener('keydown', key);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
    }, [id]);
    return null;
}
