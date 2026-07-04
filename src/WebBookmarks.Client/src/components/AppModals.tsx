import type { RefObject } from 'react';
import type { BookmarkGroup as BookmarkGroupType, WebBookmarksItem } from '../types';
import BookmarkModal from './BookmarkModal';
import ImportModal from './ImportModal';
import BulkEditModal from './BulkEditModal';
import CommandPalette from './CommandPalette';
import ConfirmModal from './ConfirmModal';

type StartupMode = 'none' | 'prompt' | 'palette';

interface Props {
    bookmarks: WebBookmarksItem[];
    profiles: string[];
    disabledProfiles: Set<string>;
    activeProfile: string;
    onReload: () => void;
    onSelectProfile: (profile: string) => void;

    // Create / edit modal
    modalOpen: boolean;
    editingBookmark: WebBookmarksItem | null;
    prefillData: Partial<WebBookmarksItem> | null;
    onModalClose: () => void;
    onModalSaved: () => void;

    // Import modal
    importOpen: boolean;
    onImportClose: () => void;

    // Bulk-edit modal
    bulkEditOpen: boolean;
    onBulkEditClose: () => void;

    // Command palette
    paletteOpen: boolean;
    paletteGroups: BookmarkGroupType[];
    startupMode: StartupMode;
    startupPaletteHiding: boolean;
    setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setStartupPaletteHiding: (v: boolean) => void;
    searchInputRef: RefObject<HTMLInputElement | null>;
    onNewBookmarkFromPalette: () => void;
    onImportFromPalette: () => void;
    onBulkEditFromPalette: () => void;

    // Delete confirmation
    pendingDelete: WebBookmarksItem | null;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
}

// Bundles every overlay dialog and wires the command palette's close/action behavior.
export default function AppModals({
    bookmarks,
    profiles,
    disabledProfiles,
    activeProfile,
    onReload,
    onSelectProfile,
    modalOpen,
    editingBookmark,
    prefillData,
    onModalClose,
    onModalSaved,
    importOpen,
    onImportClose,
    bulkEditOpen,
    onBulkEditClose,
    paletteOpen,
    paletteGroups,
    startupMode,
    startupPaletteHiding,
    setPaletteOpen,
    setStartupPaletteHiding,
    searchInputRef,
    onNewBookmarkFromPalette,
    onImportFromPalette,
    onBulkEditFromPalette,
    pendingDelete,
    onConfirmDelete,
    onCancelDelete,
}: Props) {
    return (
        <>
            {modalOpen && (
                <BookmarkModal
                    bookmark={editingBookmark}
                    allBookmarks={bookmarks}
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={onModalClose}
                    onSaved={onModalSaved}
                    prefill={prefillData}
                />
            )}

            {importOpen && (
                <ImportModal
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={onImportClose}
                    onImported={onReload}
                />
            )}

            {bulkEditOpen && (
                <BulkEditModal
                    bookmarks={bookmarks}
                    activeProfile={activeProfile}
                    profiles={profiles}
                    onClose={onBulkEditClose}
                    onChanged={onReload}
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
                                onNewBookmarkFromPalette();
                                break;
                            case 'import':
                                onImportFromPalette();
                                break;
                            case 'bulk-edit':
                                onBulkEditFromPalette();
                                break;
                            case 'select-profile':
                                if (payload) onSelectProfile(payload);
                                break;
                            case 'reload':
                                onReload();
                                break;
                            case 'show-landing':
                                setStartupPaletteHiding(false);
                                setPaletteOpen(false);
                                setTimeout(() => searchInputRef.current?.focus(), 0);
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
                    onConfirm={onConfirmDelete}
                    onCancel={onCancelDelete}
                />
            )}
        </>
    );
}
