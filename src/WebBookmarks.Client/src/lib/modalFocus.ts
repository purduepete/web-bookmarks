export function isIOSDevice(): boolean {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

/** Used only when a modal opens, leaving user and validation focus untouched. */
export function focusModalInput(input: HTMLInputElement | null): void {
    if (!input) return;
    if (!isIOSDevice()) {
        input.focus();
        return;
    }
    const dialog = input.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
}

/** A late page load must not move initial focus out of an open dialog. */
export function focusPageInput(input: HTMLInputElement | null): void {
    if (!document.querySelector('[role="dialog"]')) input?.focus();
}
