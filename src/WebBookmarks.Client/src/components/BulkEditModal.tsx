import { useState, useEffect, useRef } from 'react';
import type { WebBookmarksItem } from '../types';
import { bulkUpdateBookmarks, bulkDeleteBookmarks, fetchGroups, fetchProfiles } from '../api';
import DarkSelect from './DarkSelect';

interface Props {
    bookmarks: WebBookmarksItem[];
    activeProfile: string;
    onClose: () => void;
    onChanged: () => void;
}

export default function BulkEditModal({ bookmarks, activeProfile, onClose, onChanged }: Props) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [groups, setGroups] = useState<string[]>([]);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [action, setAction] = useState<'profile' | 'group' | 'delete' | ''>('');
    const [targetProfile, setTargetProfile] = useState(activeProfile);
    const [targetGroup, setTargetGroup] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchGroups()
            .then(setGroups)
            .catch(() => {});
        fetchProfiles()
            .then(setProfiles)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const toggleAll = (checked: boolean) => {
        if (checked) {
            setSelected(new Set(filtered.map((b) => b.id)));
        } else {
            setSelected(new Set());
        }
    };

    const toggleOne = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filtered = bookmarks.filter((b) => {
        if (!filter) return true;
        const term = filter.toLowerCase();
        return (
            b.name.toLowerCase().includes(term) ||
            b.bookmarkGroup.toLowerCase().includes(term) ||
            b.profile.toLowerCase().includes(term) ||
            b.url.toLowerCase().includes(term)
        );
    });

    const handleApply = async () => {
        if (selected.size === 0) return;
        setError(null);
        setResult(null);
        setBusy(true);

        const ids = [...selected];
        try {
            if (action === 'delete') {
                if (
                    !window.confirm(
                        `Delete ${ids.length} bookmark${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
                    )
                ) {
                    setBusy(false);
                    return;
                }
                const res = await bulkDeleteBookmarks(ids);
                setResult(`Deleted ${res.deleted} bookmark${res.deleted !== 1 ? 's' : ''}.`);
                setSelected(new Set());
                onChanged();
            } else if (action === 'profile') {
                if (!targetProfile) {
                    setError('Select a profile.');
                    setBusy(false);
                    return;
                }
                const res = await bulkUpdateBookmarks(ids, targetProfile);
                setResult(`Updated profile on ${res.updated} bookmark${res.updated !== 1 ? 's' : ''}.`);
                onChanged();
            } else if (action === 'group') {
                if (!targetGroup) {
                    setError('Select a group.');
                    setBusy(false);
                    return;
                }
                const res = await bulkUpdateBookmarks(ids, undefined, targetGroup);
                setResult(`Updated group on ${res.updated} bookmark${res.updated !== 1 ? 's' : ''}.`);
                onChanged();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Operation failed');
        } finally {
            setBusy(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

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
                    <span>Bulk Edit Bookmarks</span>
                    <button className="modal-close-btn" onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="modal-body-custom">
                    <div className="bulk-toolbar">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selected.size > 0 && selected.size === filtered.length}
                                onChange={(e) => toggleAll(e.target.checked)}
                            />
                            <span>{selected.size} selected</span>
                        </label>
                        <input
                            className="form-control form-control-sm bulk-filter"
                            placeholder="Filter bookmarks..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>

                    <div className="bulk-table-wrap">
                        <table className="bulk-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 36 }}></th>
                                    <th>Name</th>
                                    <th>Group</th>
                                    <th>Profile</th>
                                    <th>Visible</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((b) => (
                                    <tr key={b.id} className={selected.has(b.id) ? 'bulk-row-selected' : ''}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={selected.has(b.id)}
                                                onChange={() => toggleOne(b.id)}
                                            />
                                        </td>
                                        <td>{b.name}</td>
                                        <td>{b.bookmarkGroup}</td>
                                        <td>{b.profile}</td>
                                        <td>{b.isVisible ? 'Yes' : 'No'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selected.size > 0 && (
                        <div className="bulk-actions">
                            <label>Action:</label>
                            <DarkSelect
                                className="bulk-action-select"
                                value={action}
                                placeholder="-- Choose --"
                                options={[
                                    { value: '', label: '-- Choose --' },
                                    { value: 'profile', label: 'Change Profile' },
                                    { value: 'group', label: 'Change Group' },
                                    { value: 'delete', label: 'Delete' },
                                ]}
                                onChange={(v) => {
                                    setAction(v as typeof action);
                                    setResult(null);
                                }}
                            />

                            {action === 'profile' && (
                                <DarkSelect
                                    className="bulk-action-target"
                                    value={targetProfile}
                                    options={[
                                        ...profiles.map((p) => ({ value: p, label: p })),
                                        ...(!profiles.includes('all') ? [{ value: 'all', label: 'all' }] : []),
                                    ]}
                                    onChange={setTargetProfile}
                                />
                            )}

                            {action === 'group' && (
                                <DarkSelect
                                    className="bulk-action-target"
                                    value={targetGroup}
                                    placeholder="-- Select --"
                                    options={[
                                        { value: '', label: '-- Select --' },
                                        ...groups.map((g) => ({ value: g, label: g })),
                                    ]}
                                    onChange={setTargetGroup}
                                />
                            )}

                            {action && (
                                <button className="btn-modal btn-modal-save" disabled={busy} onClick={handleApply}>
                                    {busy ? 'Applying...' : `Apply to ${selected.size}`}
                                </button>
                            )}
                        </div>
                    )}

                    {result && <div className="bulk-success">{result}</div>}
                    {error && <div className="modal-error">{error}</div>}
                </div>
                <div className="modal-footer-custom">
                    <button type="button" className="btn-modal btn-modal-cancel" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
