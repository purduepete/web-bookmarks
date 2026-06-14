import { useState, useEffect, useRef, useCallback } from 'react';
import type { WebBookmarksItem } from '../types';
import { checkAlias, createBookmark, updateBookmark, fetchGroups, fetchProfiles } from '../api';
import DarkSelect from './DarkSelect';

interface Props {
    bookmark: WebBookmarksItem | null; // null = create mode
    allBookmarks: WebBookmarksItem[];
    activeProfile: string;
    onClose: () => void;
    onSaved: () => void;
    prefill?: Partial<Omit<WebBookmarksItem, 'id'>> | null;
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
    profile: 'home',
    isFavorite: false,
};

export default function BookmarkModal({ bookmark, allBookmarks, activeProfile, onClose, onSaved, prefill }: Props) {
    const isEdit = bookmark !== null;
    const [form, setForm] = useState<Omit<WebBookmarksItem, 'id'>>(
        bookmark ? { ...bookmark } : { ...emptyBookmark, profile: activeProfile, ...(prefill || {}) },
    );
    const [groups, setGroups] = useState<string[]>([]);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [newGroup, setNewGroup] = useState('');
    const [useNewGroup, setUseNewGroup] = useState(false);
    const [newProfile, setNewProfile] = useState('');
    const [useNewProfile, setUseNewProfile] = useState(false);
    const [aliasWarning, setAliasWarning] = useState<string | null>(null);
    const [sortOrderWarning, setSortOrderWarning] = useState<string | null>(null);
    const [sortOrderText, setSortOrderText] = useState(() => String(bookmark?.sortOrder ?? 0));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const aliasTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const nameRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchGroups(form.profile === 'all' ? undefined : form.profile, form.profile !== 'all')
            .then(setGroups)
            .catch(() => {});
    }, [form.profile]);

    useEffect(() => {
        fetchProfiles()
            .then(setProfiles)
            .catch(() => {});
    }, []);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    // Focus trap: keep Tab/Shift+Tab cycling within the modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;

            const modal = modalRef.current;
            if (!modal) return;

            const focusable = modal.querySelectorAll<HTMLElement>(
                'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

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

    const validateSortOrder = useCallback(
        (order: number, group: string) => {
            if (order === 0) {
                setSortOrderWarning(null);
                return;
            }
            const conflict = allBookmarks.find(
                (b) => b.bookmarkGroup === group && b.sortOrder === order && b.id !== bookmark?.id,
            );
            if (conflict) {
                setSortOrderWarning(`Sort order ${order} is already used by "${conflict.name}" in this group.`);
            } else {
                setSortOrderWarning(null);
            }
        },
        [allBookmarks, bookmark?.id],
    );

    const handleChange = (field: keyof typeof form, value: string | boolean | number) => {
        const next = { ...form, [field]: value };
        if (field === 'profile') {
            next.bookmarkGroup = '';
            setUseNewGroup(false);
        }
        setForm(next);
        if (field === 'shortcut' && typeof value === 'string') {
            validateAlias(value);
        }
        if (field === 'sortOrder' || field === 'bookmarkGroup') {
            const group =
                field === 'bookmarkGroup' ? String(value) : useNewGroup ? newGroup.trim() : next.bookmarkGroup;
            const order = field === 'sortOrder' ? Number(value) || 0 : next.sortOrder;
            validateSortOrder(order, group);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const finalGroup = useNewGroup ? newGroup.trim() : form.bookmarkGroup;
        const finalProfile = useNewProfile ? newProfile.trim() : form.profile;
        if (!form.name.trim() || !form.url.trim() || !finalGroup || !finalProfile) {
            setError('Name, URL, Group, and Profile are required.');
            setSaving(false);
            return;
        }

        const payload = {
            ...form,
            bookmarkGroup: finalGroup,
            profile: finalProfile,
            sortOrder: Number(sortOrderText) || 0,
        };

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
        <div
            className="modal-backdrop-custom"
            onClick={handleBackdropClick}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
        >
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
                                    <DarkSelect
                                        value={form.bookmarkGroup}
                                        placeholder="-- Select Group --"
                                        options={groups.map((g) => ({ value: g, label: g }))}
                                        onChange={(v) => handleChange('bookmarkGroup', v)}
                                    />
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
                        <div className="modal-field">
                            <label>Profile</label>
                            <div className="group-select-row">
                                {!useNewProfile ? (
                                    <DarkSelect
                                        value={form.profile}
                                        options={[
                                            ...(!profiles.includes('all') ? [{ value: 'all', label: 'all' }] : []),
                                            ...profiles.map((p) => ({ value: p, label: p })),
                                            ...(!profiles.includes(form.profile) && form.profile !== 'all'
                                                ? [{ value: form.profile, label: form.profile }]
                                                : []),
                                        ]}
                                        onChange={(v) => handleChange('profile', v)}
                                    />
                                ) : (
                                    <input
                                        className="form-control form-control-sm"
                                        placeholder="New profile name"
                                        value={newProfile}
                                        onChange={(e) => setNewProfile(e.target.value)}
                                        autoFocus
                                    />
                                )}
                                <button
                                    type="button"
                                    className="btn-toggle-group"
                                    onClick={() => setUseNewProfile(!useNewProfile)}
                                >
                                    {useNewProfile ? 'Existing' : '+ New'}
                                </button>
                            </div>
                        </div>
                        <div className="modal-field-row">
                            <div className="modal-field">
                                <label>Sort Order</label>
                                <input
                                    className="form-control form-control-sm"
                                    value={sortOrderText}
                                    onChange={(e) => {
                                        setSortOrderText(e.target.value);
                                        handleChange('sortOrder', Number(e.target.value) || 0);
                                    }}
                                />
                                {sortOrderWarning && <div className="alias-warning">{sortOrderWarning}</div>}
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
