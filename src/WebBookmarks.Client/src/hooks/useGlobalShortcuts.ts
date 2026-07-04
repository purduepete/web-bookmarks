import { useEffect, useRef } from 'react';

type StartupMode = 'none' | 'prompt' | 'palette';

interface Params {
    startupMode: StartupMode;
    profiles: string[];
    disabledProfiles: Set<string>;
    activeProfile: string;
    onProfileChange: (profile: string) => void;
    setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setStartupPaletteHiding: (v: boolean) => void;
    setEditMode: (v: boolean) => void;
}

// Document-level keyboard shortcuts:
//  - Ctrl/Cmd+Alt+/ toggles the command palette (in palette startup-mode it opens
//    and hides the startup landing + leaves edit mode)
//  - Ctrl+` cycles the active profile (Shift reverses). Live values are read through
//    refs so the single listener never needs to be re-bound as they change.
export function useGlobalShortcuts({
    startupMode,
    profiles,
    disabledProfiles,
    activeProfile,
    onProfileChange,
    setPaletteOpen,
    setStartupPaletteHiding,
    setEditMode,
}: Params) {
    const profilesRef = useRef(profiles);
    const disabledProfilesRef = useRef(disabledProfiles);
    const activeProfileRef = useRef(activeProfile);
    useEffect(() => {
        profilesRef.current = profiles;
    }, [profiles]);
    useEffect(() => {
        disabledProfilesRef.current = disabledProfiles;
    }, [disabledProfiles]);
    useEffect(() => {
        activeProfileRef.current = activeProfile;
    }, [activeProfile]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && e.altKey && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (startupMode === 'palette') {
                    setPaletteOpen(true);
                    setStartupPaletteHiding(true);
                    setEditMode(false);
                } else {
                    setPaletteOpen((v) => {
                        if (v) setStartupPaletteHiding(false);
                        return !v;
                    });
                }
                return;
            }
            if (e.key === '`' && e.ctrlKey) {
                const visible = profilesRef.current.filter((p) => p !== 'all' && !disabledProfilesRef.current.has(p));
                if (visible.length < 2) return;
                e.preventDefault();
                const idx = visible.indexOf(activeProfileRef.current);
                const delta = e.shiftKey ? -1 : 1;
                const next = visible[(idx + delta + visible.length) % visible.length];
                activeProfileRef.current = next;
                onProfileChange(next);
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [startupMode, onProfileChange, setPaletteOpen, setStartupPaletteHiding, setEditMode]);
}
