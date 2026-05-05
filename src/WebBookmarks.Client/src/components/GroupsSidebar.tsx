import type { BookmarkGroup } from '../types';
import { toUpperCaseStr, wildcardMatch } from '../utils';

interface Props {
    groups: BookmarkGroup[];
    filter: string;
    onFilterChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    selectedGroup: string | null;
    onGroupSelect: (group: string | null) => void;
}

export default function GroupsSidebar({
    groups,
    filter,
    onFilterChange,
    onKeyDown,
    selectedGroup,
    onGroupSelect,
}: Props) {
    const filtered = groups.filter((g) => wildcardMatch(g.name, filter));

    return (
        <>
            <div className="input-group input-group-sm mb-3">
                <span className="input-group-text input-label-text">Group</span>
                <input
                    className="form-control"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                <button
                    className={`btn-clear input-group-text${filter ? '' : ' btn-clear-hidden'}`}
                    onClick={() => onFilterChange('')}
                    aria-label="Clear"
                    tabIndex={filter ? 0 : -1}
                >
                    ×
                </button>
            </div>

            <div className="group-header">
                <span>Groups</span>
            </div>
            <table className="table table-striped table-bordered table-sm mb-0" id="groups">
                <tbody>
                    {filtered.map((g) => (
                        <tr key={g.name} onClick={() => onGroupSelect(selectedGroup === g.name ? null : g.name)}>
                            <td className={selectedGroup === g.name ? 'active-group' : ''}>
                                <span>{toUpperCaseStr(g.name)}</span>
                                <span className="bookmark-count">{g.items.length}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
