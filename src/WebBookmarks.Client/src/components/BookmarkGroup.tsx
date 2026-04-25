import type { BookmarkGroup as BookmarkGroupType } from '../types';

interface Props {
    group: BookmarkGroupType;
}

export default function BookmarkGroup({ group }: Props) {
    return (
        <div className="mb-3" id={`group-${group.name}`}>
            <div className="group-header">
                <span>{group.name}</span>
                <span className="bookmark-count">{group.items.length}</span>
            </div>
            <table className="table table-striped table-bordered mb-0">
                <tbody>
                    {group.items.map((item) => (
                        <tr key={item.id}>
                            <td className="col1">
                                <a href={item.url}>{item.name}</a>
                            </td>
                            <td className="col2">{item.description}</td>
                            <td className="col3">
                                <div className="shortcut-wrap">
                                    <span className="shortcut-label">{item.shortcut}</span>
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
