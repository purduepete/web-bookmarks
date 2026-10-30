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
import { sanitizeUrl } from '../utils';

interface Props {
    group: BookmarkGroupType;
    onEdit: (item: WebBookmarksItem) => void;
    onDelete: (item: WebBookmarksItem) => void;
    onReorder: (groupName: string, activeId: number, overId: number) => void;
    onToggleFavorite: (item: WebBookmarksItem) => void;
    conflictIds: Set<number>;
    editMode: boolean;
}

function SortableRow({
    item,
    onEdit,
    onDelete,
    onToggleFavorite,
    conflictIds,
    editMode,
}: {
    item: WebBookmarksItem;
    onEdit: (item: WebBookmarksItem) => void;
    onDelete: (item: WebBookmarksItem) => void;
    onToggleFavorite: (item: WebBookmarksItem) => void;
    conflictIds: Set<number>;
    editMode: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
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
                <button
                    className={`btn-favorite${item.isFavorite ? ' btn-favorite-active' : ''}`}
                    onClick={() => onToggleFavorite(item)}
                    aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    data-tip={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                    {item.isFavorite ? (
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    ) : (
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
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    )}
                </button>
                <span
                    className={`drag-handle${editMode ? '' : ' edit-hidden'}`}
                    ref={setActivatorNodeRef}
                    {...(editMode ? { ...attributes, ...listeners } : {})}
                    aria-label="Drag to reorder"
                    data-tip="Drag to reorder"
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    >
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </span>
                <a href={sanitizeUrl(item.url)}>{item.name}</a>
            </td>
            <td className="col3">
                <div className="shortcut-wrap">
                    {item.shortcut && (
                        <span
                            className={`shortcut-label${conflictIds.has(item.id) ? ' shortcut-conflict' : ''}`}
                        >
                            {conflictIds.has(item.id) && (
                                <span
                                    className="conflict-icon"
                                    role="img"
                                    tabIndex={0}
                                    aria-label="Alias conflicts with another shortcut"
                                    data-tip="Alias conflicts with another shortcut"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                </span>
                            )}
                            {item.shortcut}
                        </span>
                    )}
                    <button
                        className={`btn-edit-bookmark${editMode ? '' : ' edit-hidden'}`}
                        onClick={() => onEdit(item)}
                        aria-label="Edit bookmark"
                        data-tip="Edit bookmark"
                    >
                        <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                    <button
                        className={`btn-delete-bookmark${editMode ? '' : ' edit-hidden'}`}
                        onClick={() => onDelete(item)}
                        aria-label="Delete bookmark"
                        data-tip="Delete bookmark"
                    >
                        <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    );
}

export default function BookmarkGroup({
    group,
    onEdit,
    onDelete,
    onReorder,
    onToggleFavorite,
    conflictIds,
    editMode,
}: Props) {
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
                <span>{group.name.toUpperCase()}</span>
                <span className="bookmark-count">{group.items.length}</span>
            </div>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={group.items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <table className="table table-striped table-bordered mb-0">
                        <tbody>
                            {group.items.map((item) => (
                                <SortableRow
                                    key={item.id}
                                    item={item}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onToggleFavorite={onToggleFavorite}
                                    conflictIds={conflictIds}
                                    editMode={editMode}
                                />
                            ))}
                        </tbody>
                    </table>
                </SortableContext>
            </DndContext>
        </div>
    );
}
