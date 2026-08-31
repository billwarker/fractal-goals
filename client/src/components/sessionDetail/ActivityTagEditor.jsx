import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useActivityTagCatalog, useActivityTagMutations } from '../../hooks/useActivityProgressViews';
import { fractalApi } from '../../utils/api';
import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import useTagCountOverflow from './useTagCountOverflow';
import styles from './ActivityTagEditor.module.css';

function ActivityTagEditor({
    className = '',
    rootId,
    activityId,
    instanceId = null,
    setId = null,
    assignmentVersion = 1,
    availableTags = [],
    tags = [],
    inheritedTags = [],
    editable = true,
    triggerFirst = false,
}) {
    const assignmentKey = setId || instanceId;
    const editorRef = useRef(null);
    const pickerRef = useRef(null);
    const searchRef = useRef(null);
    const assignmentQueueRef = useRef(Promise.resolve());
    const assignmentGenerationRef = useRef(0);
    const assignmentVersionRef = useRef(assignmentVersion);
    const [optimisticSelection, setOptimisticSelection] = useState(null);
    const [createdTags, setCreatedTags] = useState({ activityId, tags: [] });
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [name, setName] = useState('');
    const [createScope, setCreateScope] = useState('selected');
    const [search, setSearch] = useState('');
    const [editingDefinition, setEditingDefinition] = useState(null);
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#64748B');
    const [deleteState, setDeleteState] = useState(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const { data: catalog = { tags: [] } } = useActivityTagCatalog(rootId);
    const {
        createTag,
        updateCatalogTag,
        hardDeleteCatalogTag,
        archiveTag,
        assignInstanceTags,
        assignSetTags,
        isPending,
    } = useActivityTagMutations(rootId, activityId);
    const selectedIds = optimisticSelection?.assignmentKey === assignmentKey
        ? optimisticSelection.ids
        : tags.map((tag) => tag.id);
    const pendingCreatedTags = createdTags.activityId === activityId ? createdTags.tags : [];
    const availableTagIds = new Set(availableTags.map((tag) => tag.id));
    const knownTagIds = new Set([...availableTagIds, ...pendingCreatedTags.map((tag) => tag.id)]);
    const localTagCandidates = [
        ...availableTags,
        ...pendingCreatedTags.filter((tag) => !availableTagIds.has(tag.id)),
        ...tags.filter((tag) => !knownTagIds.has(tag.id)),
    ];
    const localTags = [...new Map(localTagCandidates.map((tag) => [tag.id, tag])).values()];
    const inheritedIds = new Set(inheritedTags.map((tag) => tag.id));
    const assignableTags = localTags.filter((tag) => !tag.archived && !inheritedIds.has(tag.id));
    const filteredAssignableTags = assignableTags.filter((tag) => tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const pickerGroups = [
        { key: 'assigned', label: 'Assigned', tags: filteredAssignableTags.filter((tag) => selectedIds.includes(tag.id)) },
        { key: 'global', label: 'Every activity', tags: filteredAssignableTags.filter((tag) => !selectedIds.includes(tag.id) && tag.scope === 'global') },
        { key: 'activity', label: 'This activity', tags: filteredAssignableTags.filter((tag) => !selectedIds.includes(tag.id) && tag.scope !== 'global') },
    ].filter((group) => group.tags.length);
    const selectedTags = localTags.filter((tag) => selectedIds.includes(tag.id) && !inheritedIds.has(tag.id));
    const tagOverflow = useTagCountOverflow(selectedTags, editable);

    useAnchoredPortalPosition({
        open: editable && isPickerOpen,
        anchorRef: tagOverflow.triggerRef,
        overlayRef: pickerRef,
        margin: 16,
        maxWidth: 380,
        estimatedHeight: 440,
    });

    useEffect(() => {
        assignmentVersionRef.current = assignmentVersion;
    }, [assignmentKey, assignmentVersion]);

    useEffect(() => {
        if (!editable && isPickerOpen) {
            setIsPickerOpen(false);
            setSearch('');
        }
    }, [editable, isPickerOpen]);

    const closePicker = useCallback(({ restoreFocus = true } = {}) => {
        setIsPickerOpen(false);
        setSearch('');
        if (restoreFocus) requestAnimationFrame(() => tagOverflow.triggerRef.current?.focus());
    }, [tagOverflow.triggerRef]);

    useEffect(() => {
        if (!isPickerOpen) return undefined;
        requestAnimationFrame(() => (assignableTags.length > 5 ? searchRef.current : pickerRef.current?.querySelector('input, button'))?.focus());
        const closeOnOutsideClick = (event) => {
            if (!editorRef.current?.contains(event.target) && !pickerRef.current?.contains(event.target)) {
                closePicker({ restoreFocus: false });
            }
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') closePicker();
            if (event.key === 'Tab' && pickerRef.current) {
                const focusable = [...pickerRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [assignableTags.length, closePicker, isPickerOpen]);

    const persist = async (nextIds) => {
        const generation = assignmentGenerationRef.current + 1;
        assignmentGenerationRef.current = generation;
        setOptimisticSelection({ assignmentKey, ids: nextIds });
        const execute = async () => {
            const response = setId
                ? await assignSetTags({ setId, tagIds: nextIds, version: assignmentVersionRef.current })
                : await assignInstanceTags({ instanceId, tagIds: nextIds, version: assignmentVersionRef.current });
            if (response?.data?.version) assignmentVersionRef.current = response.data.version;
            return response;
        };
        const request = assignmentQueueRef.current.then(execute, execute);
        assignmentQueueRef.current = request.catch(() => undefined);
        try {
            await request;
        } catch (error) {
            const currentVersion = error?.response?.data?.details?.version;
            if (currentVersion) assignmentVersionRef.current = currentVersion;
            notify.error(`Failed to update tags: ${formatError(error)}`);
            throw error;
        } finally {
            if (assignmentGenerationRef.current === generation) setOptimisticSelection(null);
        }
    };

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const normalized = trimmed.toLocaleLowerCase();
            const availableMatch = assignableTags.find((tag) => tag.name.trim().toLocaleLowerCase() === normalized);
            if (availableMatch) {
                if (!selectedIds.includes(availableMatch.id)) await persist([...selectedIds, availableMatch.id]);
                setName('');
                notify.success(`Assigned existing tag “${availableMatch.name}”`);
                return;
            }
            const catalogMatch = catalog.tags.find((tag) => !tag.archived && tag.name.trim().toLocaleLowerCase() === normalized);
            let response;
            if (catalogMatch && createScope !== 'global') {
                response = await updateCatalogTag({
                    definitionId: catalogMatch.id,
                    version: catalogMatch.version,
                    activity_ids: [...new Set([...catalogMatch.activity_ids, activityId])],
                    scope: catalogMatch.scope,
                });
            } else {
                response = await createTag({ name: trimmed, scope: createScope });
            }
            const definition = response.data;
            const tag = definition.bindings?.find((binding) => binding.activity_definition_id === activityId) || definition;
            setCreatedTags((current) => ({
                activityId,
                tags: current.activityId === activityId ? [...current.tags, tag] : [tag],
            }));
            setName('');
            setCreateScope('selected');
            try {
                await persist([...selectedIds, tag.id]);
                notify.success(`Created and assigned “${tag.name}”`);
            } catch {
                notify.warning(`Created “${tag.name}”, but it could not be assigned. You can retry from the picker.`);
            }
        } catch (error) {
            notify.error(`Failed to create tag: ${formatError(error)}`);
        }
    };

    const beginEdit = (tag) => {
        const definition = catalog.tags.find((item) => item.id === tag.definition_id);
        if (!definition) return;
        setEditingDefinition(definition);
        setEditName(definition.name);
        setEditColor(definition.color || '#64748B');
        setDeleteState(null);
    };

    const saveEdit = async () => {
        if (!editingDefinition || !editName.trim()) return;
        try {
            await updateCatalogTag({
                definitionId: editingDefinition.id,
                version: editingDefinition.version,
                name: editName.trim(),
                color: editColor,
            });
            notify.success(`Updated “${editName.trim()}”`);
            setEditingDefinition(null);
        } catch (error) {
            notify.error(`Failed to update tag: ${formatError(error)}`);
        }
    };

    const prepareDelete = async (tag) => {
        const definition = catalog.tags.find((item) => item.id === tag.definition_id);
        if (!definition) return;
        try {
            const response = await fractalApi.getActivityTagImpact(rootId, definition.id);
            setDeleteState({ definition, impact: response.data });
            setDeleteConfirmation('');
            setEditingDefinition(null);
        } catch (error) {
            notify.error(`Failed to inspect tag: ${formatError(error)}`);
        }
    };

    const performDelete = async () => {
        if (!deleteState) return;
        try {
            await hardDeleteCatalogTag({
                definitionId: deleteState.definition.id,
                version: deleteState.definition.version,
                confirmation_name: deleteConfirmation || deleteState.definition.name,
            });
            setDeleteState(null);
            notify.success(`Permanently deleted “${deleteState.definition.name}”`);
        } catch (error) {
            notify.error(`Failed to delete tag: ${formatError(error)}`);
        }
    };

    const performArchive = async (tag) => {
        const definition = catalog.tags.find((item) => item.id === tag.definition_id);
        if (!definition) return;
        try {
            await archiveTag({ definitionId: definition.id, version: definition.version });
            notify.success(`Archived “${tag.name}”`);
            setArchiveTarget(null);
        } catch (error) {
            notify.error(`Failed to archive tag: ${formatError(error)}`);
        }
    };
    const addTagTrigger = editable ? (
        <Button
            variant="secondary"
            size="sm"
            className={styles.addTag}
            ref={tagOverflow.triggerRef}
            disabled={isPending}
            aria-label="Add tag"
            aria-expanded={isPickerOpen}
            aria-haspopup="dialog"
            onClick={() => (isPickerOpen ? closePicker() : setIsPickerOpen(true))}
        >
            <span className={styles.addTagIcon} aria-hidden="true">+</span>
            Tag
        </Button>
    ) : null;

    return (
        <div
            className={`${styles.editor} ${setId ? styles.setEditor : styles.instanceEditor} ${className}`}
            ref={editorRef}
            role="group"
            aria-label={setId ? 'Set tags' : 'Activity tags'}
            onClick={(event) => event.stopPropagation()}
        >
            <div className={styles.tags} ref={tagOverflow.containerRef}>
                {triggerFirst ? addTagTrigger : null}
                <span className={styles.measure} ref={tagOverflow.measureRef} aria-hidden="true">
                    {selectedTags.map((tag) => (
                        <span
                            key={`measure-${tag.id}`}
                            className={`${styles.choice} ${styles.selected} ${styles.measureItem}`}
                            data-tag-label={`${tag.name}${tag.archived ? ' (archived)' : ''}`}
                        />
                    ))}
                </span>
                {tagOverflow.isSummaryVisible && selectedTags.length > 0 ? (
                    <Badge
                        size="sm"
                        className={`${styles.choice} ${styles.selected} ${styles.summary}`}
                        aria-label={`${tagOverflow.countLabel} assigned`}
                        title={selectedTags.map((tag) => tag.name).join(', ')}
                    >
                        {tagOverflow.countLabel}
                    </Badge>
                ) : selectedTags.map((tag) => (
                    <label key={tag.id} className={`${styles.choice} ${selectedIds.includes(tag.id) ? styles.selected : ''}`} style={tag.color ? { '--tag-color': tag.color } : undefined}>
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(tag.id)}
                            disabled={isPending || !editable}
                            onChange={() => void persist(selectedIds.includes(tag.id) ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id]).catch(() => undefined)}
                        />
                        {tag.name}{tag.archived ? ' (archived)' : ''}
                    </label>
                ))}
                {triggerFirst ? null : addTagTrigger}
            </div>
            {editable && isPickerOpen && createPortal(
                <div ref={pickerRef} className={styles.picker} role="dialog" aria-modal="true" aria-label={setId ? 'Choose set tags' : 'Choose activity tags'}>
                    <div className={styles.pickerHeader}>
                        <span>Choose tags</span>
                        <CloseButton size={14} buttonSize="sm" className={styles.pickerClose} aria-label="Close tag picker" onClick={() => closePicker()} />
                    </div>
                    {assignableTags.length > 5 ? (
                        <input
                            ref={searchRef}
                            className={styles.pickerSearch}
                            type="search"
                            aria-label="Search tags"
                            placeholder="Search tags"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    ) : null}
                    <div className={styles.pickerOptions}>
                        {pickerGroups.length ? pickerGroups.map((group) => (
                            <section key={group.key} className={styles.pickerGroup} aria-labelledby={`tag-group-${group.key}`}>
                                <h4 id={`tag-group-${group.key}`}>{group.label}</h4>
                                {group.tags.map((tag) => (
                                    <div key={`picker-${tag.id}`} className={styles.pickerOptionRow} style={tag.color ? { '--tag-color': tag.color } : undefined}>
                                        <label className={styles.pickerOption}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(tag.id)}
                                                disabled={isPending}
                                                onChange={() => void persist(selectedIds.includes(tag.id)
                                                    ? selectedIds.filter((id) => id !== tag.id)
                                                    : [...selectedIds, tag.id]).catch(() => undefined)}
                                            />
                                            <span className={styles.pickerOptionDot} aria-hidden="true" />
                                            <span>{tag.name}</span>
                                        </label>
                                        <div className={styles.optionActions}>
                                            <button type="button" aria-label={`Edit ${tag.name}`} onClick={() => beginEdit(tag)}>Edit</button>
                                            <button type="button" aria-label={`Archive ${tag.name}`} onClick={() => setArchiveTarget(tag)}>Archive</button>
                                            <button type="button" aria-label={`Delete ${tag.name}`} onClick={() => prepareDelete(tag)}>Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </section>
                        )) : (
                            <span className={styles.pickerEmpty}>{search ? 'No matching tags' : 'No existing tags'}</span>
                        )}
                    </div>
                    <div className={styles.creator}>
                        <input
                            aria-label="New tag name"
                            placeholder="Create a tag"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') handleCreate();
                            }}
                        />
                        <Button size="sm" onClick={handleCreate} disabled={!name.trim() || isPending}>Create</Button>
                    </div>
                    <label className={styles.createScope}>
                        <input type="checkbox" checked={createScope === 'global'} onChange={(event) => setCreateScope(event.target.checked ? 'global' : 'selected')} />
                        Available to every activity
                    </label>
                    {editingDefinition ? (
                        <div className={styles.inlineManager}>
                            <strong>Edit tag</strong>
                            <input aria-label="Edit tag name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <input aria-label="Edit tag color" type="color" value={editColor} onChange={(event) => setEditColor(event.target.value.toUpperCase())} />
                            <div><Button size="sm" onClick={saveEdit} disabled={!editName.trim() || isPending}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEditingDefinition(null)}>Cancel</Button></div>
                        </div>
                    ) : null}
                    {archiveTarget ? (
                        <div className={styles.inlineManager}>
                            <strong>Archive “{archiveTarget.name}”?</strong>
                            <span>Existing assignments remain visible, but this tag cannot be newly assigned.</span>
                            <div><Button size="sm" variant="danger" onClick={() => performArchive(archiveTarget)} disabled={isPending}>Archive</Button><Button size="sm" variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button></div>
                        </div>
                    ) : null}
                    {deleteState ? (
                        <div className={styles.inlineManager}>
                            <strong>Delete “{deleteState.definition.name}” permanently?</strong>
                            <span>{deleteState.impact.usage.total} linked item{deleteState.impact.usage.total === 1 ? '' : 's'} will lose this tag.</span>
                            {deleteState.impact.usage.total ? <input aria-label={`Type ${deleteState.definition.name} to confirm`} placeholder={`Type ${deleteState.definition.name}`} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /> : null}
                            <div><Button size="sm" variant="danger" onClick={performDelete} disabled={isPending || (Boolean(deleteState.impact.usage.total) && deleteConfirmation.trim().toLocaleLowerCase() !== deleteState.definition.name.trim().toLocaleLowerCase())}>Delete</Button><Button size="sm" variant="secondary" onClick={() => setDeleteState(null)}>Cancel</Button></div>
                        </div>
                    ) : null}
                </div>,
                document.body,
            )}
        </div>
    );
}

export default ActivityTagEditor;
