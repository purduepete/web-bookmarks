import { useState, useEffect, useCallback, useRef } from 'react';
import { reorderBookmarks, toggleFavorite } from './api';
import type { WebBookmarksItem } from './types';
import { openUrls } from './utils';
import { useBookmarks } from './hooks/useBookmarks';
import { useBookmarkGroups } from './hooks/useBookmarkGroups';
import { useModals } from './hooks/useModals';
import { focusPageInput } from './lib/modalFocus';
import { useStartup } from './hooks/useStartup';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useFirstLoad } from './hooks/useFirstLoad';
import PageLoading from './components/PageLoading';

import BookmarkList from './components/BookmarkList';
import ProfileTabs from './components/ProfileTabs';
import Toolbar from './components/Toolbar';
import AppModals from './components/AppModals';
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
        reload,
    } = useBookmarks();
    useFirstLoad(!loading, !!error);

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
    } = useModals({ loadBookmarks: reload, setError, openPalette, closePalette });

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
            focusPageInput(bookmarkInputRef.current);
        }
    }, [loading, promptActive]);

    const { groups, paletteGroups, conflictIds, displayedGroups } = useBookmarkGroups(
        bookmarks,
        searchFilter,
    );

    const openFilteredBookmarks = useCallback(
        (newTab = false) => {
            openUrls(
                displayedGroups
                    .flatMap((g) => g.items)
                    .map((item) => ({ name: item.name, url: item.url })),
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
                prev.map((b) =>
                    orderById.has(b.id) ? { ...b, sortOrder: orderById.get(b.id)! } : b,
                ),
            );

            try {
                await reorderBookmarks(entries);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Reorder failed');
                loadBookmarks();
            }
        },
        [groups, loadBookmarks, setBookmarks, setError],
    );

    const handleToggleFavorite = useCallback(
        async (item: WebBookmarksItem) => {
            // Optimistic update
            setBookmarks((prev) =>
                prev.map((b) => (b.id === item.id ? { ...b, isFavorite: !b.isFavorite } : b)),
            );
            try {
                await toggleFavorite(item.id);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Toggle favorite failed');
                loadBookmarks();
            }
        },
        [loadBookmarks, setBookmarks, setError],
    );

    // Only show a full-page error when there's nothing cached to fall back on.
    // If we have bookmarks (from cache), keep showing them and surface the
    // failure as a non-blocking banner below instead of wiping the UI.
    if (promptActive) {
        return (
            <div className="app-body">
                {loading && !error && <PageLoading />}
                {error && bookmarks.length === 0 && (
                    <div className="loading-msg text-danger" role="alert">
                        {error}
                    </div>
                )}
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
            {loading && !error && <PageLoading />}
            {error && bookmarks.length === 0 && (
                <div className="loading-msg text-danger" role="alert">
                    {error}
                </div>
            )}
            <div className="header-spacer" />

            <div
                id="colMain"
                style={startupPaletteHiding || newBookmarkOnly ? { display: 'none' } : undefined}
            >
                {error && bookmarks.length > 0 && (
                    <div className="offline-banner text-warning" role="status">
                        ⚠ Showing available bookmarks. {error}
                    </div>
                )}
                <ProfileTabs
                    profiles={profiles}
                    disabledProfiles={disabledProfiles}
                    activeProfile={activeProfile}
                    onProfileChange={handleProfileChange}
                />
                <Toolbar
                    searchInputRef={bookmarkInputRef}
                    searchFilter={searchFilter}
                    onSearchChange={setSearchFilter}
                    onSearchKeyDown={handleSearchKeyDown}
                    onReload={reload}
                    onOpenPalette={() => {
                        setPaletteOpen(true);
                        setStartupPaletteHiding(true);
                    }}
                    optionsRef={optionsRef}
                    optionsOpen={optionsOpen}
                    onToggleOptions={() => setOptionsOpen((v) => !v)}
                    onCloseOptions={() => setOptionsOpen(false)}
                    showHidden={showHidden}
                    onShowHiddenChange={setShowHidden}
                    editMode={editMode}
                    onEditModeChange={setEditMode}
                    onImport={openImport}
                    onBulkEdit={openBulkEdit}
                    profiles={profiles}
                    disabledProfiles={disabledProfiles}
                    onToggleDisabledProfile={toggleDisabledProfile}
                    startupMode={startupMode}
                    onStartupModeChange={handleStartupModeChange}
                    onNewBookmark={() => openCreateModal()}
                />

                <BookmarkList
                    groups={displayedGroups}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    onReorder={handleReorder}
                    onToggleFavorite={handleToggleFavorite}
                    conflictIds={conflictIds}
                    editMode={editMode}
                />
            </div>

            <AppModals
                bookmarks={bookmarks}
                profiles={profiles}
                disabledProfiles={disabledProfiles}
                activeProfile={activeProfile}
                onReload={reload}
                onSelectProfile={handleProfileChange}
                modalOpen={modalOpen}
                editingBookmark={editingBookmark}
                prefillData={prefillData}
                onModalClose={handleModalClose}
                onModalSaved={handleModalSaved}
                importOpen={importOpen}
                onImportClose={closeImport}
                bulkEditOpen={bulkEditOpen}
                onBulkEditClose={closeBulkEdit}
                paletteOpen={paletteOpen}
                paletteGroups={paletteGroups}
                startupMode={startupMode}
                startupPaletteHiding={startupPaletteHiding}
                setPaletteOpen={setPaletteOpen}
                setStartupPaletteHiding={setStartupPaletteHiding}
                searchInputRef={bookmarkInputRef}
                onNewBookmarkFromPalette={openCreateFromPalette}
                onImportFromPalette={openImportFromPalette}
                onBulkEditFromPalette={openBulkEditFromPalette}
                pendingDelete={pendingDelete}
                onConfirmDelete={performDelete}
                onCancelDelete={cancelDelete}
            />
        </div>
    );
}
