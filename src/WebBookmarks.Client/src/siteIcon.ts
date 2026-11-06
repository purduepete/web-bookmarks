// The app is always dark, so the iOS site icon follows the device's light/dark setting.
// iOS saves whichever icon is linked when the app is added to the home screen.
export const SITE_ICONS = {
    light: '/apple-touch-icon-light.png?v=2',
    dark: '/apple-touch-icon.png?v=2',
} as const;

export function trackSiteIcon(): () => void {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () =>
        document
            .querySelector('link[rel="apple-touch-icon"]')
            ?.setAttribute('href', media.matches ? SITE_ICONS.light : SITE_ICONS.dark);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
}
