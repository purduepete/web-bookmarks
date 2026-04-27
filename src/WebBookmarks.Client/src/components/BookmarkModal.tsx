import { useState, useEffect, useRef, useCallback } from 'react';
import type { WebBookmarksItem } from '../types';
import { checkAlias, createBookmark, updateBookmark, fetchGroups } from '../api';

interface Props {
    bookmark: WebBookmarksItem | null; // null = create mode
    onClose: () => void;
    onSaved: () => void;
}

const emptyBookmark: Omit<WebBookmarksItem, 'id'> = {
    name: '',
    shortcut: '',
    description: '',
    url: '',
    urls: '',
    isVisible: true,
    bookmarkGroup: '',
    sortOrder: 0,
};

export default function BookmarkModal({ bookmark, onClose, onSaved }: Props) {
    const isEdit = bookmark !== null;
    const [form, setForm] = useState<Omit<WebBookmarksItem, 'id'>>(bookmark ? { ...bookmark } : { ...emptyBookmark });
    const [groups, setGroups] = useState<string[]>([]);
    const [newGroup, setNewGroup] = useState('');
    const [useNewGroup, setUseNewGroup] = useState(false);
    const [aliasWarning, setAliasWarning] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const aliasTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchGroups()
            .then(setGroups)
            .catch(() => {});
    }, []);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const validateAlias = useCallback(
        (alias: string) => {
            if (aliasTimer.current) clearTimeout(aliasTimer.current);
            if (!alias.trim()) {
                setAliasWarning(null);
                return;
            }
            aliasTimer.current = setTimeout(async () => {
                try {
                    const result = await checkAlias(alias, bookmark?.id);
                    if (result.isDuplicate) {
                        const names = result.matches.map((m) => `"${m.shortcut}" (${m.name})`).join(', ');
                        setAliasWarning(`Partial match with: ${names}`);
                    } else {
                        setAliasWarning(null);
                    }
                } catch {
                    // ignore check errors
                }
            }, 400);
        },
        [bookmark?.id],
    );

    const handleChange = (field: keyof typeof form, value: string | boolean | number) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (field === 'shortcut' && typeof value === 'string') {
            validateAlias(value);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const finalGroup = useNewGroup ? newGroup.trim() : form.bookmarkGroup;
        if (!form.name.trim() || !form.url.trim() || !finalGroup) {
            setError('Name, URL, and Group are required.');
            setSaving(false);
            return;
        }

        const payload = { ...form, bookmarkGroup: finalGroup };

        try {
            if (isEdit && bookmark) {
                await updateBookmark(bookmark.id, { ...payload, id: bookmark.id });
            } else {
                await createBookmark(payload);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="modal-backdrop-custom" onClick={handleBackdropClick}>
            <div className="modal-content-custom">
                <div className="modal-header-custom">
                    <span>{isEdit ? 'Edit Bookmark' : 'New Bookmark'}</span>
                    <button className="modal-close-btn" onClick={onClose}>
                        ×
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body-custom">
                        <div className="modal-field">
                            <label>Name</label>
                            <input
                                ref={nameRef}
                                className="form-control form-control-sm"
                                value={form.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                            />
                        </div>
                        <div className="modal-field">
                            <label>URL</label>
                            <input
                                className="form-control form-control-sm"
                                value={form.url}
                                onChange={(e) => handleChange('url', e.target.value)}
                            />
                        </div>
                        <div className="modal-field">
                            <label>Search URL (optional, use {'{q}'} placeholder)</label>
                            <input
                                className="form-control form-control-sm"
                                value={form.urls ?? ''}
                                onChange={(e) => handleChange('urls', e.target.value)}
                            />
                        </div>
                        <div className="modal-field">
                            <label>Alias / Shortcut</label>
                            <input
                                className="form-control form-control-sm"
                                value={form.shortcut}
                                onChange={(e) => handleChange('shortcut', e.target.value)}
                            />
                            {aliasWarning && <div className="alias-warning">{aliasWarning}</div>}
                        </div>

                        <div className="modal-field">
                            <label>Group</label>
                            <div className="group-select-row">
                                {!useNewGroup ? (
                                    <select
                                        className="form-control form-control-sm"
                                        value={form.bookmarkGroup}
                                        onChange={(e) => handleChange('bookmarkGroup', e.target.value)}
                                    >
                                        <option value="">-- Select Group --</option>
                                        {groups.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="form-control form-control-sm"
                                        placeholder="New group name"
                                        value={newGroup}
                                        onChange={(e) => setNewGroup(e.target.value)}
                                        autoFocus
                                    />
                                )}
                                <button
                                    type="button"
                                    className="btn-toggle-group"
                                    onClick={() => setUseNewGroup(!useNewGroup)}
                                >
                                    {useNewGroup ? 'Existing' : '+ New'}
                                </button>
                            </div>
                        </div>
                        <div className="modal-field-row">
                            <div className="modal-field">
                                <label>Sort Order</label>
                                <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    value={form.sortOrder}
                                    onChange={(e) => handleChange('sortOrder', Number(e.target.value))}
                                />
                            </div>
                            <div className="modal-field">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={form.isVisible}
                                        onChange={(e) => handleChange('isVisible', e.target.checked)}
                                    />
                                    <span>Visible</span>
                                </label>
                            </div>
                        </div>
                        {error && <div className="modal-error">{error}</div>}
                    </div>
                    <div className="modal-footer-custom">
                        <button type="button" className="btn-modal btn-modal-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-modal btn-modal-save" disabled={saving}>
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
