import { useState, useRef, useCallback } from 'react';
import type { WebBookmarksItem } from '../types';
import { deleteBookmark } from '../api';

interface Params {
    loadBookmarks: () => void;
    setError: (msg: string | null) => void;
    // Opens/closes the command palette. Used to hand off between the palette and a
    // modal: opening a modal from the palette closes it, and closing that modal
    // re-opens the palette (see modalFromPaletteRef).
    openPalette: () => void;
    closePalette: () => void;
}

// Owns all modal / confirm dialog state and the create/edit/import/bulk-edit/delete
// handlers. The `newBookmarkOnly` flag (driven by the ?new=1 deep link) lives here
// because it governs whether the main list is hidden while only the create modal
// is shown; useStartup opens the prefilled modal via openCreateModal.
export function useModals({ loadBookmarks, setError, openPalette, closePalette }: Params) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBookmark, setEditingBookmark] = useState<WebBookmarksItem | null>(null);
    const [prefillData, setPrefillData] = useState<Partial<WebBookmarksItem> | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<WebBookmarksItem | null>(null);
    const [newBookmarkOnly, setNewBookmarkOnly] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('new') === '1';
        } catch {
            return false;
        }
    });
    // When a modal was opened from the palette, re-open the palette once it closes.
    const modalFromPaletteRef = useRef(false);

    const maybeReopenPalette = useCallback(() => {
        if (modalFromPaletteRef.current) {
            modalFromPaletteRef.current = false;
            openPalette();
        }
    }, [openPalette]);

    const openCreateModal = useCallback((prefill: Partial<WebBookmarksItem> | null = null) => {
        setEditingBookmark(null);
        setPrefillData(prefill);
        setModalOpen(true);
    }, []);

    const openEditModal = useCallback((item: WebBookmarksItem) => {
        setEditingBookmark(item);
        setModalOpen(true);
    }, []);

    const handleModalClose = useCallback(() => {
        setModalOpen(false);
        setEditingBookmark(null);
        setPrefillData(null);
        setNewBookmarkOnly(false);
        maybeReopenPalette();
    }, [maybeReopenPalette]);

    const handleModalSaved = useCallback(() => {
        setModalOpen(false);
        setEditingBookmark(null);
        setPrefillData(null);
        setNewBookmarkOnly(false);
        loadBookmarks();
        maybeReopenPalette();
    }, [loadBookmarks, maybeReopenPalette]);

    const handleDelete = useCallback((item: WebBookmarksItem) => {
        setPendingDelete(item);
    }, []);

    const cancelDelete = useCallback(() => {
        setPendingDelete(null);
    }, []);

    const performDelete = useCallback(async () => {
        const item = pendingDelete;
        setPendingDelete(null);
        if (!item) return;
        try {
            await deleteBookmark(item.id);
            loadBookmarks();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Delete failed');
        }
    }, [pendingDelete, loadBookmarks, setError]);

    const openImport = useCallback(() => {
        setImportOpen(true);
    }, []);

    const closeImport = useCallback(() => {
        setImportOpen(false);
        maybeReopenPalette();
    }, [maybeReopenPalette]);

    const openBulkEdit = useCallback(() => {
        setBulkEditOpen(true);
    }, []);

    const closeBulkEdit = useCallback(() => {
        setBulkEditOpen(false);
        maybeReopenPalette();
    }, [maybeReopenPalette]);

    const openCreateFromPalette = useCallback(() => {
        modalFromPaletteRef.current = true;
        setEditingBookmark(null);
        setPrefillData(null);
        setModalOpen(true);
        closePalette();
    }, [closePalette]);

    const openImportFromPalette = useCallback(() => {
        modalFromPaletteRef.current = true;
        setImportOpen(true);
        closePalette();
    }, [closePalette]);

    const openBulkEditFromPalette = useCallback(() => {
        modalFromPaletteRef.current = true;
        setBulkEditOpen(true);
        closePalette();
    }, [closePalette]);

    return {
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
    };
}
