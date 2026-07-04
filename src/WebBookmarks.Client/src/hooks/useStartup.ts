import { useState, useEffect, useRef, useCallback } from 'react';
import type { WebBookmarksItem } from '../types';
import { navigateByShortcut } from '../utils';

type StartupMode = 'none' | 'prompt' | 'palette';

interface Params {
    forceLanding: boolean;
    bookmarks: WebBookmarksItem[];
    activeProfile: string;
    onProfileChange: (profile: string) => void;
    // Opens the command palette (used by palette startup-mode + bfcache restore).
    openPalette: () => void;
    setStartupPaletteHiding: (v: boolean) => void;
    // Opens the create modal pre-filled from the ?new=1 deep link.
    openPrefilledModal: (prefill: Partial<WebBookmarksItem>) => void;
}

// Owns startup-mode state (none/prompt/palette), the quick-command prompt loop, and
// the effects that run the chosen startup experience once bookmarks load, restore it
// on bfcache navigation, and handle the ?new=1 Tampermonkey deep link.
export function useStartup({
    forceLanding,
    bookmarks,
    activeProfile,
    onProfileChange,
    openPalette,
    setStartupPaletteHiding,
    openPrefilledModal,
}: Params) {
    const [startupMode, setStartupMode] = useState<StartupMode>(() => {
        if (forceLanding) return 'none';
        const saved = localStorage.getItem('startupMode');
        if (saved === 'prompt' || saved === 'palette') return saved;
        return 'none';
    });
    const [promptActive, setPromptActive] = useState(() => {
        if (forceLanding) return false;
        return localStorage.getItem('startupMode') === 'prompt';
    });
    const [promptModalOpen, setPromptModalOpen] = useState(false);
    const promptShown = useRef(false);
    const skipStartupOverlay = useRef(false);

    // On mount: open the New Bookmark modal pre-filled if URL has ?new=1 (used by Tampermonkey)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') !== '1') return;
        skipStartupOverlay.current = true;
        promptShown.current = true; // suppress startup prompt/palette
        setPromptActive(false);
        setStartupPaletteHiding(false);
        const url = params.get('url') || '';
        const name = params.get('name') || '';
        const description = params.get('desc') || '';
        const profile = params.get('profile') || '';
        const group = params.get('group') || '';
        if (profile && profile !== activeProfile) {
            onProfileChange(profile);
        }
        openPrefilledModal({
            url,
            name,
            description,
            profile: profile || activeProfile,
            bookmarkGroup: group,
        });
        // Clean URL so reloads don't reopen the dialog
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', clean);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const showPromptLoop = useCallback(() => {
        setPromptModalOpen(true);
    }, []);

    const handlePromptSubmit = useCallback(
        (input: string) => {
            setPromptModalOpen(false);
            if (input.trim().toLowerCase() !== 'help' && input.trim() !== '') {
                // Navigate immediately — keep the page blank during navigation
                if (navigateByShortcut(input, bookmarks)) return;
            }
            setPromptActive(false);
        },
        [bookmarks],
    );

    const handlePromptCancel = useCallback(() => {
        setPromptModalOpen(false);
        setPromptActive(false);
    }, []);

    // Show prompt or palette on page load based on startupMode (once only)
    useEffect(() => {
        if (bookmarks.length > 0 && !promptShown.current) {
            promptShown.current = true;
            if (skipStartupOverlay.current) return;
            if (startupMode === 'prompt') {
                showPromptLoop();
            } else if (startupMode === 'palette') {
                openPalette();
                setPromptActive(false);
            }
        }
    }, [bookmarks]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-open palette when returning via back/forward (bfcache) on iPad/Safari
    useEffect(() => {
        const handlePageShow = (e: PageTransitionEvent) => {
            if (e.persisted && startupMode === 'palette') {
                openPalette();
                setStartupPaletteHiding(true);
            }
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, [startupMode, openPalette, setStartupPaletteHiding]);

    const handleStartupModeChange = useCallback((mode: StartupMode) => {
        setStartupMode(mode);
        localStorage.setItem('startupMode', mode);
    }, []);

    return {
        startupMode,
        promptActive,
        promptModalOpen,
        handleStartupModeChange,
        handlePromptSubmit,
        handlePromptCancel,
    };
}
