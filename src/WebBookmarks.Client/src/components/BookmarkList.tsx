import type { BookmarkGroup as BookmarkGroupType, WebBookmarksItem } from '../types';
import BookmarkGroupComponent from './BookmarkGroup';

interface Props {
    groups: BookmarkGroupType[];
    onEdit: (item: WebBookmarksItem) => void;
    onDelete: (item: WebBookmarksItem) => void;
    onReorder: (groupName: string, activeId: number, overId: number) => void;
    onToggleFavorite: (item: WebBookmarksItem) => void;
    conflictIds: Set<number>;
    editMode: boolean;
}

// Renders the displayed bookmark groups. Each group is its own dnd-kit sortable table.
export default function BookmarkList({
    groups,
    onEdit,
    onDelete,
    onReorder,
    onToggleFavorite,
    conflictIds,
    editMode,
}: Props) {
    return (
        <>
            {groups.map((g) => (
                <BookmarkGroupComponent
                    key={g.name}
                    group={g}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReorder={onReorder}
                    onToggleFavorite={onToggleFavorite}
                    conflictIds={conflictIds}
                    editMode={editMode}
                />
            ))}
        </>
    );
}
