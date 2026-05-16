import { useState, useRef, useEffect } from 'react';
import type { WebBookmarksItem } from '../types';
import { bulkCreateBookmarks, fetchProfiles, fetchGroups } from '../api';

interface Props {
    activeProfile: string;
    onClose: () => void;
    onImported: () => void;
}

interface ParsedBookmark {
    name: string;
    url: string;
    folder: string;
    selected: boolean;
}

function parseEdgeHtml(html: string): ParsedBookmark[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const results: ParsedBookmark[] = [];

    function walk(node: Element, folder: string) {
        for (const child of Array.from(node.children)) {
            if (child.tagName === 'DT') {
                const h3 = child.querySelector(':scope > H3');
                const anchor = child.querySelector(':scope > A');
                const dl = child.querySelector(':scope > DL');

                if (h3 && dl) {
                    // It's a folder
                    const folderName = h3.textContent?.trim() || 'Ungrouped';
                    walk(dl, folderName);
                } else if (anchor) {
                    const name = anchor.textContent?.trim() || '';
                    const url = anchor.getAttribute('HREF') || '';
                    if (name && url) {
                        results.push({ name, url, folder: folder || 'Ungrouped', selected: true });
                    }
                }
            } else if (child.tagName === 'DL') {
                walk(child, folder);
            }
        }
    }

    const rootDl = doc.querySelector('DL');
    if (rootDl) walk(rootDl, '');
    return results;
}

export default function ImportModal({ activeProfile, onClose, onImported }: Props) {
    const [parsed, setParsed] = useState<ParsedBookmark[]>([]);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<number | null>(null);
    const [profile, setProfile] = useState(activeProfile);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [existingGroups, setExistingGroups] = useState<string[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchProfiles()
            .then(setProfiles)
            .catch(() => {});
        fetchGroups()
            .then(setExistingGroups)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            setParsed(parseEdgeHtml(text));
            setDone(null);
            setError(null);
        };
        reader.readAsText(file);
    };

    const toggleAll = (checked: boolean) => {
        setParsed((prev) => prev.map((b) => ({ ...b, selected: checked })));
    };

    const toggleOne = (index: number) => {
        setParsed((prev) => prev.map((b, i) => (i === index ? { ...b, selected: !b.selected } : b)));
    };

    const editField = (index: number, field: keyof ParsedBookmark, value: string) => {
        setParsed((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
    };

    const handleImport = async () => {
        setError(null);
        setImporting(true);
        const selected = parsed.filter((b) => b.selected);
        if (selected.length === 0) {
            setError('No bookmarks selected.');
            setImporting(false);
            return;
        }
        const items: Omit<WebBookmarksItem, 'id'>[] = selected.map((b) => ({
            name: b.name,
            url: b.url,
            urls: '',
            shortcut: '',
            description: '',
            isVisible: true,
            bookmarkGroup: b.folder,
            sortOrder: 0,
            profile: profile,
        }));
        try {
            const result = await bulkCreateBookmarks(items);
            setDone(result.imported);
            onImported();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    const selectedCount = parsed.filter((b) => b.selected).length;
    const folders = [...new Set(parsed.map((b) => b.folder))];

    return (
        <div
            className="modal-backdrop-custom"
            onClick={handleBackdropClick}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
        >
            <div className="modal-content-custom modal-wide">
                <div className="modal-header-custom">
                    <span>Import Bookmarks</span>
                    <button className="modal-close-btn" onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="modal-body-custom">
                    <div className="modal-field">
                        <label>Select Edge favorites HTML export file</label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".html,.htm"
                            className="form-control form-control-sm"
                            onChange={handleFile}
                        />
                    </div>

                    {parsed.length > 0 && (
                        <>
                            <div className="bulk-toolbar">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={selectedCount === parsed.length}
                                        onChange={(e) => toggleAll(e.target.checked)}
                                    />
                                    <span>
                                        Select All ({selectedCount}/{parsed.length})
                                    </span>
                                </label>
                                <span className="bulk-info">
                                    {folders.length} folder{folders.length !== 1 ? 's' : ''} found
                                </span>
                                <label className="bulk-profile-label">
                                    Profile:
                                    <select
                                        className="form-control form-control-sm bulk-profile-select"
                                        value={profile}
                                        onChange={(e) => setProfile(e.target.value)}
                                    >
                                        {profiles.map((p) => (
                                            <option key={p} value={p}>
                                                {p}
                                            </option>
                                        ))}
                                        {!profiles.includes('all') && <option value="all">all</option>}
                                    </select>
                                </label>
                            </div>
                            <div className="bulk-table-wrap">
                                <table className="bulk-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 36 }}></th>
                                            <th>Name</th>
                                            <th>URL</th>
                                            <th>Folder → Group</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsed.map((b, i) => (
                                            <tr key={i} className={b.selected ? '' : 'bulk-row-dim'}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input"
                                                        checked={b.selected}
                                                        onChange={() => toggleOne(i)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="bulk-edit-input"
                                                        value={b.name}
                                                        onChange={(e) => editField(i, 'name', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="bulk-edit-input bulk-url-cell"
                                                        value={b.url}
                                                        onChange={(e) => editField(i, 'url', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="bulk-edit-input"
                                                        value={b.folder}
                                                        onChange={(e) => editField(i, 'folder', e.target.value)}
                                                    >
                                                        {[
                                                            ...new Set([
                                                                ...existingGroups,
                                                                ...parsed.map((p) => p.folder),
                                                            ]),
                                                        ]
                                                            .sort()
                                                            .map((g) => (
                                                                <option key={g} value={g}>
                                                                    {g}
                                                                </option>
                                                            ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {done !== null && (
                        <div className="bulk-success">
                            Successfully imported {done} bookmark{done !== 1 ? 's' : ''}.
                        </div>
                    )}
                    {error && <div className="modal-error">{error}</div>}
                </div>
                <div className="modal-footer-custom">
                    <button type="button" className="btn-modal btn-modal-cancel" onClick={onClose}>
                        Close
                    </button>
                    {parsed.length > 0 && done === null && (
                        <button
                            type="button"
                            className="btn-modal btn-modal-save"
                            disabled={importing || selectedCount === 0}
                            onClick={handleImport}
                        >
                            {importing
                                ? 'Importing...'
                                : `Import ${selectedCount} Bookmark${selectedCount !== 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
