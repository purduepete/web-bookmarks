import type { RefObject } from 'react';

type StartupMode = 'none' | 'prompt' | 'palette';

interface Props {
    searchInputRef: RefObject<HTMLInputElement | null>;
    searchFilter: string;
    onSearchChange: (value: string) => void;
    onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onReload: () => void;
    onOpenPalette: () => void;
    optionsRef: RefObject<HTMLDivElement | null>;
    optionsOpen: boolean;
    onToggleOptions: () => void;
    onCloseOptions: () => void;
    showHidden: boolean;
    onShowHiddenChange: (value: boolean) => void;
    editMode: boolean;
    onEditModeChange: (value: boolean) => void;
    onImport: () => void;
    onBulkEdit: () => void;
    profiles: string[];
    disabledProfiles: Set<string>;
    onToggleDisabledProfile: (profile: string) => void;
    startupMode: StartupMode;
    onStartupModeChange: (mode: StartupMode) => void;
    onNewBookmark: () => void;
}

// Search bar + command-palette button + options dropdown (view toggles, import/bulk
// actions, per-profile enable) + startup-mode radios + new/clear buttons.
export default function Toolbar({
    searchInputRef,
    searchFilter,
    onSearchChange,
    onSearchKeyDown,
    onReload,
    onOpenPalette,
    optionsRef,
    optionsOpen,
    onToggleOptions,
    onCloseOptions,
    showHidden,
    onShowHiddenChange,
    editMode,
    onEditModeChange,
    onImport,
    onBulkEdit,
    profiles,
    disabledProfiles,
    onToggleDisabledProfile,
    startupMode,
    onStartupModeChange,
    onNewBookmark,
}: Props) {
    return (
        <div className="input-group input-group-sm mb-3">
            <span className="input-group-text input-label-text" onClick={onReload}>
                Search
            </span>
            <input
                ref={searchInputRef}
                className="form-control"
                placeholder="/ bookmarks · @ groups · * favorites"
                value={searchFilter}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
            />
            <button className="btn-palette input-group-text" onClick={onOpenPalette} title="Command Palette (Ctrl+Alt+/)">
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
                <button className="btn-options input-group-text" onClick={onToggleOptions} title="Options">
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
                                onChange={(e) => onShowHiddenChange(e.target.checked)}
                            />
                            Hidden
                        </label>
                        <label className="dropdown-options-item">
                            <input
                                type="checkbox"
                                className="form-check-input mt-0 me-1"
                                checked={editMode}
                                onChange={(e) => onEditModeChange(e.target.checked)}
                            />
                            Edit
                        </label>
                        <div className="dropdown-options-divider" />
                        <div className="dropdown-options-heading">Actions</div>
                        <button
                            className="dropdown-options-item dropdown-options-btn"
                            onClick={() => {
                                onImport();
                                onCloseOptions();
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
                                onBulkEdit();
                                onCloseOptions();
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
                                                onChange={() => onToggleDisabledProfile(p)}
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
                        onChange={() => onStartupModeChange('prompt')}
                    />
                    Prompt
                </label>
                <label className="startup-mode-option">
                    <input
                        type="radio"
                        className="form-check-input mt-0 me-1"
                        name="startupMode"
                        checked={startupMode === 'palette'}
                        onChange={() => onStartupModeChange('palette')}
                    />
                    Palette
                </label>
                <label className="startup-mode-option">
                    <input
                        type="radio"
                        className="form-check-input mt-0 me-1"
                        name="startupMode"
                        checked={startupMode === 'none'}
                        onChange={() => onStartupModeChange('none')}
                    />
                    None
                </label>
            </span>
            <button className="btn-new-bookmark input-group-text" onClick={onNewBookmark} title="New Bookmark">
                +
            </button>
            <button
                className={`btn-clear input-group-text${searchFilter ? '' : ' btn-clear-inactive'}`}
                onClick={() => searchFilter && onSearchChange('')}
                aria-label="Clear"
                tabIndex={searchFilter ? 0 : -1}
            >
                ×
            </button>
        </div>
    );
}
