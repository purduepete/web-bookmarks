import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBookmarks, fetchProfiles } from '../api';
import type { WebBookmarksItem } from '../types';
import { getLocalBookmarks, setLocalBookmarks, hasNoCachedBookmarks } from '../lib/bookmarkCache';

const initialProfile = () => localStorage.getItem('activeProfile') || 'home';

// Owns the bookmark data layer: the bookmark list, load/error/loading state, the
// available/active/disabled profiles, and the view's showHidden toggle (which
// participates in fetching). Renders instantly from the per-profile local cache,
// then refreshes from the API in the background.
export function useBookmarks() {
    const [activeProfile, setActiveProfile] = useState<string>(initialProfile);
    const [profiles, setProfiles] = useState<string[]>(() => {
        try {
            const cached = localStorage.getItem('profiles');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [disabledProfiles, setDisabledProfiles] = useState<Set<string>>(() => {
        try {
            const cached = localStorage.getItem('disabledProfiles');
            return cached ? new Set<string>(JSON.parse(cached)) : new Set<string>();
        } catch {
            return new Set<string>();
        }
    });
    const [showHidden, setShowHidden] = useState(true);

    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>(() => getLocalBookmarks(initialProfile()) ?? []);
    const [loading, setLoading] = useState(() => hasNoCachedBookmarks(initialProfile()));
    const [error, setError] = useState<string | null>(null);

    // Monotonic token identifying the latest in-flight load. Each loadBookmarks()
    // call claims a new token; a resolution only touches state if it still owns the
    // latest token, so a slow earlier request for a previous profile/filter can no
    // longer overwrite the UI once the dependencies have changed (stale-fetch race).
    const requestIdRef = useRef(0);

    const loadBookmarks = useCallback(() => {
        const requestId = ++requestIdRef.current;
        setError(null);
        // Immediately show locally cached bookmarks for this profile
        const local = getLocalBookmarks(activeProfile);
        if (local) setBookmarks(local);
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
        fetchProfiles()
            .then((data) => {
                localStorage.setItem('profiles', JSON.stringify(data));
                if (requestId !== requestIdRef.current) return;
                setProfiles(data);
            })
            .catch(() => {});
    }, [showHidden, activeProfile]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

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
        loading,
        error,
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
    };
}
