import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBookmarks, fetchProfiles } from '../api';
import type { WebBookmarksItem } from '../types';
import { getLocalBookmarks, setLocalBookmarks, hasNoCachedBookmarks } from '../lib/bookmarkCache';

const initialProfile = () => localStorage.getItem('activeProfile') || 'home';

function readProfiles() {
    try {
        const cached = localStorage.getItem('profiles');
        if (cached === null) return { profiles: [], ready: false, error: null };
        const profiles: unknown = JSON.parse(cached);
        if (!Array.isArray(profiles) || !profiles.every((profile) => typeof profile === 'string')) {
            throw new Error('Invalid saved profiles list.');
        }
        return { profiles: profiles as string[], ready: true, error: null };
    } catch (cause) {
        console.error('[webbookmarks] Failed to read saved profiles:', cause);
        return { profiles: [], ready: false, error: 'Saved profiles could not be read.' };
    }
}

// Owns the bookmark data layer: the bookmark list, load/error/loading state, the
// available/active/disabled profiles, and the view's showHidden toggle (which
// participates in fetching). Renders instantly from the per-profile local cache,
// then refreshes from the API in the background.
export function useBookmarks() {
    const [activeProfile, setActiveProfile] = useState<string>(initialProfile);
    const [initialProfiles] = useState(readProfiles);
    const [profiles, setProfiles] = useState<string[]>(initialProfiles.profiles);
    const [profileError, setProfileError] = useState<string | null>(initialProfiles.error);
    const [disabledProfiles, setDisabledProfiles] = useState<Set<string>>(() => {
        try {
            const cached = localStorage.getItem('disabledProfiles');
            return cached ? new Set<string>(JSON.parse(cached)) : new Set<string>();
        } catch {
            return new Set<string>();
        }
    });
    const [showHidden, setShowHidden] = useState(true);

    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>(
        () => getLocalBookmarks(initialProfile()) ?? [],
    );
    const [loading, setLoading] = useState(() => hasNoCachedBookmarks(initialProfile()));
    const [error, setError] = useState<string | null>(null);
    const [profilesReady, setProfilesReady] = useState(initialProfiles.ready);

    // Monotonic token identifying the latest in-flight load. Each loadBookmarks()
    // call claims a new token; a resolution only touches state if it still owns the
    // latest token, so a slow earlier request for a previous profile/filter can no
    // longer overwrite the UI once the dependencies have changed (stale-fetch race).
    const requestIdRef = useRef(0);

    const loadBookmarks = useCallback(() => {
        const requestId = ++requestIdRef.current;
        setError(null);
        // Immediately show locally cached bookmarks for this profile. If this
        // profile has no cache (e.g. first switch to it), clear the previous
        // profile's list and show loading so stale bookmarks aren't left on screen.
        const local = getLocalBookmarks(activeProfile);
        if (local) {
            setBookmarks(local);
        } else {
            setBookmarks([]);
            setLoading(true);
        }
        // Fetch fresh data in background
        fetchBookmarks(showHidden, activeProfile)
            .then((data) => {
                // Always cache under the profile this request was for (correct key),
                // but only drive the UI if this is still the latest request.
                setLocalBookmarks(activeProfile, data);
                if (requestId !== requestIdRef.current) return;
                setBookmarks(data);
            })
            .catch((e) => {
                if (requestId !== requestIdRef.current) return;
                setError(e.message);
            })
            .finally(() => {
                if (requestId !== requestIdRef.current) return;
                setLoading(false);
            });
    }, [showHidden, activeProfile]);

    // Profiles change rarely (only when a mutation/import introduces or removes
    // one), so they're fetched separately from bookmarks: once on mount and
    // explicitly after mutations (via `reload`). Previously this ran on every
    // bookmark load, re-fetching the profile list on each showHidden toggle and
    // profile switch even though the list was unchanged.
    const refreshProfiles = useCallback(() => {
        fetchProfiles()
            .then((data) => {
                if (!Array.isArray(data) || !data.every((profile) => typeof profile === 'string')) {
                    throw new Error('The server returned an invalid profiles list.');
                }
                setProfiles(data);
                setProfileError(null);
                try {
                    localStorage.setItem('profiles', JSON.stringify(data));
                } catch (cause) {
                    console.error('[webbookmarks] Failed to save profiles:', cause);
                    setProfileError('Profiles loaded, but could not be saved on this device.');
                }
            })
            .catch((cause: unknown) => {
                console.error('[webbookmarks] Failed to load profiles:', cause);
                setProfileError(
                    cause instanceof Error ? cause.message : 'Profiles could not be loaded.',
                );
            })
            .finally(() => setProfilesReady(true));
    }, []);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    useEffect(() => {
        refreshProfiles();
    }, [refreshProfiles]);

    // Refresh both the bookmark list and the profile list. Used by mutation/import
    // flows, which can add or remove a profile; the plain auto-load path only
    // needs bookmarks.
    const reload = useCallback(() => {
        loadBookmarks();
        refreshProfiles();
    }, [loadBookmarks, refreshProfiles]);

    const handleProfileChange = useCallback((profile: string) => {
        setActiveProfile(profile);
        localStorage.setItem('activeProfile', profile);
    }, []);

    const toggleDisabledProfile = useCallback((profile: string) => {
        setDisabledProfiles((prev) => {
            const next = new Set(prev);
            if (next.has(profile)) next.delete(profile);
            else next.add(profile);
            localStorage.setItem('disabledProfiles', JSON.stringify([...next]));
            return next;
        });
    }, []);

    return {
        bookmarks,
        setBookmarks,
        loading: loading || !profilesReady,
        error: [error, profileError].filter(Boolean).join(' ') || null,
        setError,
        activeProfile,
        setActiveProfile,
        profiles,
        disabledProfiles,
        toggleDisabledProfile,
        handleProfileChange,
        showHidden,
        setShowHidden,
        loadBookmarks,
        reload,
        refreshProfiles,
    };
}
