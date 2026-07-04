import { useState, useEffect, useCallback, useRef } from 'react';
import { reorderBookmarks, toggleFavorite } from './api';
import type { WebBookmarksItem } from './types';
import { openUrls } from './utils';
import { useBookmarks } from './hooks/useBookmarks';
import { useBookmarkGroups } from './hooks/useBookmarkGroups';
import { useModals } from './hooks/useModals';
import { useStartup } from './hooks/useStartup';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';

import BookmarkGroupComponent from './components/BookmarkGroup';
import BookmarkModal from './components/BookmarkModal';
import ImportModal from './components/ImportModal';
import BulkEditModal from './components/BulkEditModal';
import CommandPalette from './components/CommandPalette';
import ConfirmModal from './components/ConfirmModal';
import PromptModal from './components/PromptModal';

export default function App() {
    const {
        bookmarks,
        setBookmarks,
        loading,
        error,
        setError,
        activeProfile,
        profiles,
        disabledProfiles,
        toggleDisabledProfile,
        handleProfileChange,
        showHidden,
        setShowHidden,
        loadBookmarks,
    } = useBookmarks();

    const [searchFilter, setSearchFilter] = useState('');
    const forceLanding = (() => {
        try {
            return new URLSearchParams(window.location.search).get('landing') === '1';
        } catch {
            return false;
        }
    })();
    const bookmarkInputRef = useRef<HTMLInputElement>(null);
    const [editMode, setEditMode] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const optionsRef = useRef<HTMLDivElement>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [startupPaletteHiding, setStartupPaletteHiding] = useState(() => {
        if (forceLanding) return false;
        const saved = localStorage.getItem('startupMode');
        return saved === 'palette';
    });

    const openPalette = useCallback(() => setPaletteOpen(true), []);
    const closePalette = useCallback(() => setPaletteOpen(false), []);

    // Close options dropdown when clicking outside
    useEffect(() => {
        if (!optionsOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
                setOptionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [optionsOpen]);

    const {
        modalOpen,
        editingBookmark,
        prefillData,
        importOpen,
        bulkEditOpen,
        pendingDelete,
        newBookmarkOnly,
        openCreateModal,
        openEditModal,
        handleModalClose,
        handleModalSaved,
        handleDelete,
        cancelDelete,
        performDelete,
        openImport,
        closeImport,
        openBulkEdit,
        closeBulkEdit,
        openCreateFromPalette,
        openImportFromPalette,
        openBulkEditFromPalette,
    } = useModals({ loadBookmarks, setError, openPalette, closePalette });

    const {
        startupMode,
        promptActive,
        promptModalOpen,
        handleStartupModeChange,
        handlePromptSubmit,
        handlePromptCancel,
    } = useStartup({
        forceLanding,
        bookmarks,
        activeProfile,
        onProfileChange: handleProfileChange,
        openPalette,
        setStartupPaletteHiding,
        openPrefilledModal: openCreateModal,
    });

    useGlobalShortcuts({
        startupMode,
        profiles,
        disabledProfiles,
        activeProfile,
        onProfileChange: handleProfileChange,
        setPaletteOpen,
        setStartupPaletteHiding,
        setEditMode,
    });

    useEffect(() => {
        if (!loading && !promptActive) {
            bookmarkInputRef.current?.focus();
        }
    }, [loading, promptActive]);

    const { groups, paletteGroups, conflictIds, displayedGroups } = useBookmarkGroups(bookmarks, searchFilter);

    const openFilteredBookmarks = useCallback(
        (newTab = false) => {
            openUrls(
                displayedGroups.flatMap((g) => g.items).map((item) => ({ name: item.name, url: item.url })),
                newTab,
            );
        },
        [displayedGroups],
    );

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && searchFilter.trim()) {
                openFilteredBookmarks(e.ctrlKey || e.metaKey);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchFilter('');
            }
        },
        [searchFilter, openFilteredBookmarks],
    );

    const handleReorder = useCallback(
        async (groupName: string, activeId: number, overId: number) => {
            const group = groups.find((g) => g.name === groupName);
            if (!group) return;
            const items = [...group.items];
            const oldIndex = items.findIndex((i) => i.id === activeId);
            const newIndex = items.findIndex((i) => i.id === overId);
            if (oldIndex < 0 || newIndex < 0) return;

            const [moved] = items.splice(oldIndex, 1);
            items.splice(newIndex, 0, moved);
            const entries = items.map((i, pos) => ({ id: i.id, sortOrder: pos }));

            // Optimistic update — apply new sort orders in a single pass via a map.
            const orderById = new Map(entries.map((e) => [e.id, e.sortOrder]));
            setBookmarks((prev) =>
                prev.map((b) => (orderById.has(b.id) ? { ...b, sortOrder: orderById.get(b.id)! } : b)),
            );

            try {
                await reorderBookmarks(entries);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Reorder failed');
                loadBookmarks();
            }
        },
        [groups, loadBookmarks],
    );

    const handleToggleFavorite = useCallback(
        async (item: WebBookmarksItem) => {
            // Optimistic update
            setBookmarks((prev) => prev.map((b) => (b.id === item.id ? { ...b, isFavorite: !b.isFavorite } : b)));
            try {
                await toggleFavorite(item.id);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Toggle favorite failed');
                loadBookmarks();
            }
        },
        [loadBookmarks],
    );

    if (loading) return null;
    // Only show a full-page error when there's nothing cached to fall back on.
    // If we have bookmarks (from cache), keep showing them and surface the
    // failure as a non-blocking banner below instead of wiping the UI.
    if (error && bookmarks.length === 0) return <div className="loading-msg text-danger">{error}</div>;
    if (promptActive) {
        return (
            <div className="app-body">
                {promptModalOpen && (
                    <PromptModal
                        title="Quick command"
                        message="Type `help` for a list of commands:"
                        placeholder="Enter a shortcut…"
                        onSubmit={handlePromptSubmit}
                        onCancel={handlePromptCancel}
                    />
                )}
            </div>
        );
    }
    return (
        <div className="app-body">
            <div className="header-spacer" />

            <div id="colMain" style={startupPaletteHiding || newBookmarkOnly ? { display: 'none' } : undefined}>
                {error && bookmarks.length > 0 && (
                    <div className="offline-banner text-warning" role="status">
                        ⚠ Showing saved bookmarks — couldn't reach the server.
                    </div>
                )}
                {profiles.filter((p) => !disabledProfiles.has(p)).length > 1 && (
                    <div className="profile-tabs">
                        {profiles
                            .filter((p) => !disabledProfiles.has(p))
                            .map((p) => (
                                <button
                                    key={p}
                                    className={`profile-tab${p === activeProfile ? ' profile-tab-active' : ''}`}
                                    onClick={() => handleProfileChange(p)}
                                >
                                    {p}
                                </button>
                            ))}
                    </div>
                )}
                <div className="input-group input-group-sm mb-3">
                    <span className="input-group-text input-label-text" onClick={loadBookmarks}>
                        Search
                    </span>
                    <input
                        ref={bookmarkInputRef}
                        className="form-control"
                        placeholder="/ bookmarks · @ groups · * favorites"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                    <button
                        className="btn-palette input-group-text"
                        onClick={() => {
                            setPaletteOpen(true);
                            setStartupPaletteHiding(true);
                        }}
                        title="Command Palette (Ctrl+Alt+/)"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="10.5" cy="10.5" r="7" />
                            <line x1="15.5" y1="15.5" x2="22" y2="22" />
                        </svg>
                    </button>
                    <div className="dropdown-options-wrap" ref={optionsRef}>
                        <button
                            className="btn-options input-group-text"
                            onClick={() => setOptionsOpen((v) => !v)}
                            title="Options"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                        {optionsOpen && (
                            <div className="dropdown-options-menu">
                                <div className="dropdown-options-heading">View</div>
                                <label className="dropdown-options-item">
                                    <input
                                        type="checkbox"
                                        className="form-check-input mt-0 me-1"
                                        checked={showHidden}
                                        onChange={(e) => setShowHidden(e.target.checked)}
                                    />
                                    Hidden
                                </label>
                                <label className="dropdown-options-item">
                                    <input
                                        type="checkbox"
                                        className="form-check-input mt-0 me-1"
                                        checked={editMode}
                                        onChange={(e) => setEditMode(e.target.checked)}
                                    />
                                    Edit
                                </label>
                                <div className="dropdown-options-divider" />
                                <div className="dropdown-options-heading">Actions</div>
                                <button
                                    className="dropdown-options-item dropdown-options-btn"
                                    onClick={() => {
                                        openImport();
                                        setOptionsOpen(false);
                                    }}
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    Import
                                </button>
                                <button
                                    className="dropdown-options-item dropdown-options-btn"
                                    onClick={() => {
                                        openBulkEdit();
                                        setOptionsOpen(false);
                                    }}
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                    Bulk Edit
                                </button>
                                {profiles.filter((p) => p !== 'all').length > 1 && (
                                    <>
                                        <div className="dropdown-options-divider" />
                                        <div className="dropdown-options-heading">Profiles</div>
                                        {profiles
                                            .filter((p) => p !== 'all')
                                            .map((p) => (
                                                <label key={p} className="dropdown-options-item">
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input mt-0 me-1"
                                                        checked={!disabledProfiles.has(p)}
                                                        onChange={() => toggleDisabledProfile(p)}
                                                    />
                                                    {p}
                                                </label>
                                            ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <span className="input-group-text startup-mode-group">
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'prompt'}
                                onChange={() => handleStartupModeChange('prompt')}
                            />
                            Prompt
                        </label>
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'palette'}
                                onChange={() => handleStartupModeChange('palette')}
                            />
                            Palette
                        </label>
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'none'}
                                onChange={() => handleStartupModeChange('none')}
                            />
                            None
                        </label>
                    </span>
                    <button
                        className="btn-new-bookmark input-group-text"
                        onClick={() => openCreateModal()}
                        title="New Bookmark"
                    >
                        +
                    </button>
                    <button
                        className={`btn-clear input-group-text${searchFilter ? '' : ' btn-clear-inactive'}`}
                        onClick={() => searchFilter && setSearchFilter('')}
                        aria-label="Clear"
                        tabIndex={searchFilter ? 0 : -1}
                    >
                        ×
                    </button>
                </div>

                {displayedGroups.map((g) => (
                    <BookmarkGroupComponent
                        key={g.name}
                        group={g}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onReorder={handleReorder}
                        onToggleFavorite={handleToggleFavorite}
                        conflictIds={conflictIds}
                        editMode={editMode}
                    />
                ))}
            </div>

            {modalOpen && (
                <BookmarkModal
                    bookmark={editingBookmark}
                    allBookmarks={bookmarks}
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={handleModalClose}
                    onSaved={handleModalSaved}
                    prefill={prefillData}
                />
            )}

            {importOpen && (
                <ImportModal
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={closeImport}
                    onImported={loadBookmarks}
                />
            )}

            {bulkEditOpen && (
                <BulkEditModal
                    bookmarks={bookmarks}
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={closeBulkEdit}
                    onChanged={loadBookmarks}
                />
            )}

            {paletteOpen && (
                <CommandPalette
                    groups={paletteGroups}
                    onClose={(navigating) => {
                        if (startupMode === 'palette' && !navigating) return;
                        setPaletteOpen(false);
                        if (startupPaletteHiding && !navigating) setStartupPaletteHiding(false);
                    }}
                    onAction={(action, payload) => {
                        switch (action) {
                            case 'new-bookmark':
                                openCreateFromPalette();
                                break;
                            case 'import':
                                openImportFromPalette();
                                break;
                            case 'bulk-edit':
                                openBulkEditFromPalette();
                                break;
                            case 'select-profile':
                                if (payload) handleProfileChange(payload);
                                break;
                            case 'reload':
                                loadBookmarks();
                                break;
                            case 'show-landing':
                                setStartupPaletteHiding(false);
                                setPaletteOpen(false);
                                setTimeout(() => bookmarkInputRef.current?.focus(), 0);
                                break;
                        }
                    }}
                    profiles={profiles.filter((p) => !disabledProfiles.has(p))}
                    activeProfile={activeProfile}
                    isPaletteMode={startupMode === 'palette'}
                />
            )}

            {pendingDelete && (
                <ConfirmModal
                    title="Delete bookmark"
                    message={`Delete "${pendingDelete.name}"?`}
                    confirmLabel="Delete"
                    danger
                    onConfirm={performDelete}
                    onCancel={cancelDelete}
                />
            )}
        </div>
    );
}
