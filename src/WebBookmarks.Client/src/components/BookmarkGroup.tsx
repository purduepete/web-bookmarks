import { useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BookmarkGroup as BookmarkGroupType, WebBookmarksItem } from '../types';
import { toUpperCaseStr } from '../utils';

interface Props {
    group: BookmarkGroupType;
    onEdit: (item: WebBookmarksItem) => void;
    onDelete: (item: WebBookmarksItem) => void;
    onReorder: (groupName: string, activeId: number, overId: number) => void;
    conflictIds: Set<number>;
}

function SortableRow({
    item,
    onEdit,
    onDelete,
    conflictIds,
}: {
    item: WebBookmarksItem;
    onEdit: (item: WebBookmarksItem) => void;
    onDelete: (item: WebBookmarksItem) => void;
    conflictIds: Set<number>;
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
    };

    return (
        <tr ref={setNodeRef} style={style} className={item.isVisible ? '' : 'row-hidden-bookmark'}>
            <td className="col1">
                <span
                    className="drag-handle"
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    title="Drag to reorder"
                >
                    ☰
                </span>
                <a href={item.url}>{item.name}</a>
            </td>
            <td className="col3">
                <div className="shortcut-wrap">
                    <span className={`shortcut-label${conflictIds.has(item.id) ? ' shortcut-conflict' : ''}`}>
                        {conflictIds.has(item.id) && (
                            <span className="conflict-icon" title="Alias conflicts with another shortcut">
                                ⚠
                            </span>
                        )}
                        {item.shortcut}
                    </span>
                    <button className="btn-edit-bookmark" onClick={() => onEdit(item)} title="Edit bookmark">
                        ✎
                    </button>
                    <button className="btn-delete-bookmark" onClick={() => onDelete(item)} title="Delete bookmark">
                        ✕
                    </button>
                </div>
            </td>
        </tr>
    );
}

export default function BookmarkGroup({ group, onEdit, onDelete, onReorder, conflictIds }: Props) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
                onReorder(group.name, active.id as number, over.id as number);
            }
        },
        [group.name, onReorder],
    );

    return (
        <div className="mb-3" id={`group-${group.name}`}>
            <div className="group-header">
                <span>{toUpperCaseStr(group.name)}</span>
                <span className="bookmark-count">{group.items.length}</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={group.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <table className="table table-striped table-bordered mb-0">
                        <tbody>
                            {group.items.map((item) => (
                                <SortableRow
                                    key={item.id}
                                    item={item}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    conflictIds={conflictIds}
                                />
                            ))}
                        </tbody>
                    </table>
                </SortableContext>
            </DndContext>
        </div>
    );
}
