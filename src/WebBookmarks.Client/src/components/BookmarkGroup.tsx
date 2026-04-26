import type { BookmarkGroup as BookmarkGroupType, WebBookmarksItem } from '../types';

interface Props {
    group: BookmarkGroupType;
    onEdit: (item: WebBookmarksItem) => void;
    conflictIds: Set<number>;
}

export default function BookmarkGroup({ group, onEdit, conflictIds }: Props) {
    return (
        <div className="mb-3" id={`group-${group.name}`}>
            <div className="group-header">
                <span>{group.name}</span>
                <span className="bookmark-count">{group.items.length}</span>
            </div>
            <table className="table table-striped table-bordered mb-0">
                <tbody>
                    {group.items.map((item) => (
                        <tr key={item.id} className={item.isVisible ? '' : 'row-hidden-bookmark'}>
                            <td className="col1">
                                <a href={item.url}>{item.name}</a>
                            </td>
                            <td className="col2">{item.description}</td>
                            <td className="col3">
                                <div className="shortcut-wrap">
                                    <span
                                        className={`shortcut-label${conflictIds.has(item.id) ? ' shortcut-conflict' : ''}`}
                                    >
                                        {conflictIds.has(item.id) && (
                                            <span
                                                className="conflict-icon"
                                                title="Alias conflicts with another shortcut"
                                            >
                                                ⚠
                                            </span>
                                        )}
                                        {item.shortcut}
                                    </span>
                                    <button
                                        className="btn-edit-bookmark"
                                        onClick={() => onEdit(item)}
                                        title="Edit bookmark"
                                    >
                                        ✎
                                    </button>
                                    <span className="shortcut-id">{item.id}</span>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
