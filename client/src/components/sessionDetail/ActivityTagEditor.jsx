import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useActivityTagCatalog, useActivityTagCatalogMutations, useActivityTagMutations } from '../../hooks/useActivityTags';
import { fractalApi } from '../../utils/api';
import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { canonicalTagName, findTagByName } from '../../utils/tagNames';
import { familiesWithMembers, groupTagsForPicker, toggleTagSelection } from '../../utils/tagPickerOptions';
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
    tags = [],
    inheritedTags = [],
    editable = true,
    triggerFirst = false,
    // Controlled mode (planned tags, comparison choices): the ids live in the caller's draft
    // and nothing is assigned through the API. Creating a tag still adds it to the catalog.
    selectedTagIds = null,
    onChangeTags = null,
    setScope = false,
    // What the tags belong to, when not an activity or set (e.g. "Round 2 tags").
    scopeLabel = null,
    // Stacked: `leading` (a label) and the trigger on one line, chosen tags wrapping beneath
    // unless the caller shows them itself (`showSelected={false}`).
    leading = null,
    showSelected = true,
}) {
    const isStacked = leading != null;
    const isSetScope = Boolean(setId) || setScope;
    const groupLabel = scopeLabel || (isSetScope ? 'Set tags' : 'Activity tags');
    const assignmentKey = setId || instanceId;
    const editorRef = useRef(null);
    const pickerRef = useRef(null);
    const searchRef = useRef(null);
    const assignmentQueueRef = useRef(Promise.resolve());
    const assignmentGenerationRef = useRef(0);
    const assignmentVersionRef = useRef(assignmentVersion);
    const [optimisticSelection, setOptimisticSelection] = useState(null);
    const [createdTags, setCreatedTags] = useState([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [editingDefinition, setEditingDefinition] = useState(null);
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#64748B');
    const [deleteState, setDeleteState] = useState(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const { data: catalog } = useActivityTagCatalog(rootId);
    const { createTag, restoreTag, assignInstanceTags, assignSetTags, isPending: isAssigning } = useActivityTagMutations(rootId, activityId);
    const {
        updateTag: updateCatalogTag,
        hardDeleteTag: hardDeleteCatalogTag,
        archiveTag,
        isPending: isManaging,
    } = useActivityTagCatalogMutations(rootId);
    const isPending = isAssigning || isManaging;
    const isControlled = typeof onChangeTags === 'function';
    const selectedIds = isControlled
        ? (selectedTagIds || [])
        : optimisticSelection?.assignmentKey === assignmentKey
            ? optimisticSelection.ids
            : tags.map((tag) => tag.id);
    // The catalog is the source of options; tags created this moment and assigned tags
    // fill in until the catalog refetches.
    const tagsById = new Map([...tags, ...createdTags, ...catalog.tags].map((tag) => [tag.id, tag]));
    const pickerCatalog = { families: catalog.families, tags: [...tagsById.values()] };
    const families = familiesWithMembers(pickerCatalog);
    const inheritedIds = new Set(inheritedTags.map((tag) => tag.id));
    const assignableCount = pickerCatalog.tags.filter((tag) => !tag.archived && !inheritedIds.has(tag.id)).length;
    const pickerGroups = groupTagsForPicker(pickerCatalog, { keepIds: selectedIds, search })
        .map((group) => ({ ...group, tags: group.tags.filter((tag) => !inheritedIds.has(tag.id)) }))
        .filter((group) => group.tags.length);
    const selectedTags = selectedIds.map((id) => tagsById.get(id)).filter((tag) => tag && !inheritedIds.has(tag.id));
    const nameMatch = findTagByName(pickerCatalog.tags, name);
    const toggle = (tag) => toggleTagSelection(selectedIds, tag, families);
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
        requestAnimationFrame(() => (assignableCount > 5 ? searchRef.current : pickerRef.current?.querySelector('input, button'))?.focus());
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
    }, [assignableCount, closePicker, isPickerOpen]);

    // ``newTags``: tags created this moment, not yet in the catalog until it refetches.
    const persist = async (nextIds, newTags = []) => {
        if (isControlled) {
            onChangeTags(nextIds);
            return;
        }
        const generation = assignmentGenerationRef.current + 1;
        assignmentGenerationRef.current = generation;
        setOptimisticSelection({ assignmentKey, ids: nextIds });
        // Full tag objects let an offline (queued) assignment show immediately.
        const known = new Map([...tagsById.values(), ...newTags].map((tag) => [tag.id, tag]));
        const nextTags = nextIds.map((id) => known.get(id)).filter(Boolean);
        const execute = async () => {
            const response = setId
                ? await assignSetTags({ setId, tagIds: nextIds, version: assignmentVersionRef.current, tags: nextTags })
                : await assignInstanceTags({
                    instanceId, tagIds: nextIds, version: assignmentVersionRef.current, tags: nextTags,
                });
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
        const trimmed = canonicalTagName(name);
        if (!trimmed) return;
        try {
            // Names are unique per fractal: a matching tag is selected (or restored), never duplicated.
            if (nameMatch && !nameMatch.archived) {
                if (!selectedIds.includes(nameMatch.id)) await persist(toggle(nameMatch));
                setName('');
                notify.success(`Assigned existing tag “${nameMatch.name}”`);
                return;
            }
            const response = nameMatch
                ? await restoreTag({ definitionId: nameMatch.id, version: nameMatch.version })
                : await createTag({ name: trimmed });
            const tag = response.data;
            setCreatedTags((current) => [...current.filter((item) => item.id !== tag.id), tag]);
            setName('');
            try {
                await persist(toggleTagSelection(selectedIds, tag, families), [tag]);
                notify.success(`${nameMatch ? 'Restored' : 'Created'} and assigned “${tag.name}”`);
            } catch {
                notify.warning(`Saved “${tag.name}”, but it could not be assigned. You can retry from the picker.`);
            }
        } catch (error) {
            notify.error(`Failed to create tag: ${formatError(error)}`);
        }
    };

    const beginEdit = (tag) => {
        const definition = catalog.tags.find((item) => item.id === tag.id);
        if (!definition) return;
        setEditingDefinition(definition);
        setEditName(definition.name);
        setEditColor(definition.color || '#64748B');
        setDeleteState(null);
    };

    const saveEdit = async () => {
        if (!editingDefinition || !canonicalTagName(editName)) return;
        const collision = findTagByName(catalog.tags, editName);
        if (collision && collision.id !== editingDefinition.id) {
            notify.error(`“${collision.name}” already exists. Merge tags from Manage Tags.`);
            return;
        }
        try {
            await updateCatalogTag({
                definitionId: editingDefinition.id,
                version: editingDefinition.version,
                name: canonicalTagName(editName),
                color: editColor,
            });
            notify.success(`Updated “${editName.trim()}”`);
            setEditingDefinition(null);
        } catch (error) {
            notify.error(`Failed to update tag: ${formatError(error)}`);
        }
    };

    const prepareDelete = async (tag) => {
        const definition = catalog.tags.find((item) => item.id === tag.id);
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
        const definition = catalog.tags.find((item) => item.id === tag.id);
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

    const tagChoice = (tag) => (
        <label key={tag.id} className={`${styles.choice} ${selectedIds.includes(tag.id) ? styles.selected : ''}`} style={tag.color ? { '--tag-color': tag.color } : undefined}>
            <input
                type="checkbox"
                checked={selectedIds.includes(tag.id)}
                disabled={isPending || !editable}
                onChange={() => void persist(toggle(tag)).catch(() => undefined)}
            />
            {tag.name}{tag.archived ? ' (archived)' : ''}
        </label>
    );

    return (
        <div
            className={`${styles.editor} ${isStacked ? styles.stackedEditor : isSetScope ? styles.setEditor : styles.instanceEditor} ${className}`}
            ref={editorRef}
            role="group"
            aria-label={groupLabel}
            onClick={(event) => event.stopPropagation()}
        >
            {isStacked ? (<>
                <div className={styles.stackedHead}>{leading}{addTagTrigger}</div>
                {showSelected && selectedTags.length ? <div className={styles.stackedList}>{selectedTags.map(tagChoice)}</div> : null}
            </>) : (
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
                ) : selectedTags.map(tagChoice)}
                {triggerFirst ? null : addTagTrigger}
            </div>
            )}
            {editable && isPickerOpen && createPortal(
                <div ref={pickerRef} className={styles.picker} role="dialog" aria-modal="true" aria-label={`Choose ${groupLabel.toLocaleLowerCase()}`}>
                    <div className={styles.pickerHeader}>
                        <span>Choose tags</span>
                        <CloseButton size={14} buttonSize="sm" className={styles.pickerClose} aria-label="Close tag picker" onClick={() => closePicker()} />
                    </div>
                    {assignableCount > 5 ? (
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
                                <h4 id={`tag-group-${group.key}`}>
                                    {group.label}
                                    {group.singleSelect ? <span className={styles.pickOne}>Single select</span> : null}
                                </h4>
                                {group.tags.map((tag) => (
                                    <div key={`picker-${tag.id}`} className={styles.pickerOptionRow} style={tag.color ? { '--tag-color': tag.color } : undefined}>
                                        <label className={styles.pickerOption}>
                                            <input
                                                checked={selectedIds.includes(tag.id)}
                                                disabled={isPending}
                                                type={group.singleSelect ? 'radio' : 'checkbox'}
                                                name={group.singleSelect ? `tag-family-${assignmentKey || 'plan'}-${group.key}` : undefined}
                                                onClick={group.singleSelect && selectedIds.includes(tag.id)
                                                    ? () => void persist(toggle(tag)).catch(() => undefined) : undefined}
                                                onChange={() => void persist(toggle(tag)).catch(() => undefined)}
                                            />
                                            <span className={styles.pickerOptionDot} aria-hidden="true" />
                                            <span>{tag.name}{tag.archived ? ' (archived)' : ''}</span>
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
                        <Button size="sm" onClick={handleCreate} disabled={!canonicalTagName(name) || isPending}>
                            {!nameMatch ? 'Create' : nameMatch.archived ? 'Restore' : selectedIds.includes(nameMatch.id) ? 'Added' : 'Add'}
                        </Button>
                    </div>
                    {nameMatch ? (
                        <p className={styles.creatorHint} role="status">
                            {nameMatch.archived
                                ? `“${nameMatch.name}” is archived. Restore it to use it again.`
                                : `“${nameMatch.name}” already exists${selectedIds.includes(nameMatch.id) ? ' and is assigned.' : '. Add it instead of creating a copy.'}`}
                        </p>
                    ) : null}
                    {editingDefinition ? (
                        <div className={styles.inlineManager}>
                            <strong>Edit tag</strong>
                            <input aria-label="Edit tag name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                            <input aria-label="Edit tag color" type="color" value={editColor} onChange={(event) => setEditColor(event.target.value.toUpperCase())} />
                            <div><Button size="sm" onClick={saveEdit} disabled={!canonicalTagName(editName) || isPending}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEditingDefinition(null)}>Cancel</Button></div>
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
