import { useEffect, useRef, useState } from 'react';

import { useActivityTagMutations } from '../../hooks/useActivityProgressViews';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import styles from './ActivityTagEditor.module.css';

function ActivityTagEditor({ rootId, activityId, instanceId = null, setId = null, assignmentVersion = 1, availableTags = [], tags = [], inheritedTags = [] }) {
    const assignmentKey = setId || instanceId;
    const editorRef = useRef(null);
    const triggerRef = useRef(null);
    const pickerRef = useRef(null);
    const searchRef = useRef(null);
    const assignmentQueueRef = useRef(Promise.resolve());
    const assignmentGenerationRef = useRef(0);
    const assignmentVersionRef = useRef(assignmentVersion);
    const [optimisticSelection, setOptimisticSelection] = useState(null);
    const [createdTags, setCreatedTags] = useState({ activityId, tags: [] });
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const { createTag, assignInstanceTags, assignSetTags, isPending } = useActivityTagMutations(rootId, activityId);
    const selectedIds = optimisticSelection?.assignmentKey === assignmentKey
        ? optimisticSelection.ids
        : tags.map((tag) => tag.id);
    const pendingCreatedTags = createdTags.activityId === activityId ? createdTags.tags : [];
    const availableTagIds = new Set(availableTags.map((tag) => tag.id));
    const knownTagIds = new Set([...availableTagIds, ...pendingCreatedTags.map((tag) => tag.id)]);
    const localTags = [
        ...availableTags,
        ...pendingCreatedTags.filter((tag) => !availableTagIds.has(tag.id)),
        ...tags.filter((tag) => !knownTagIds.has(tag.id)),
    ];
    const inheritedIds = new Set(inheritedTags.map((tag) => tag.id));
    const assignableTags = localTags.filter((tag) => !tag.archived && !inheritedIds.has(tag.id));
    const filteredAssignableTags = assignableTags.filter((tag) => tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const selectedTags = localTags.filter((tag) => selectedIds.includes(tag.id) && !inheritedIds.has(tag.id));

    useEffect(() => {
        assignmentVersionRef.current = assignmentVersion;
    }, [assignmentKey, assignmentVersion]);

    const closePicker = ({ restoreFocus = true } = {}) => {
        setIsPickerOpen(false);
        setSearch('');
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useEffect(() => {
        if (!isPickerOpen) return undefined;
        requestAnimationFrame(() => (assignableTags.length > 5 ? searchRef.current : pickerRef.current?.querySelector('input, button'))?.focus());
        const closeOnOutsideClick = (event) => {
            if (!editorRef.current?.contains(event.target)) closePicker({ restoreFocus: false });
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
    }, [assignableTags.length, isPickerOpen]);

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
            const response = await createTag({ name: trimmed });
            const tag = response.data;
            setCreatedTags((current) => ({
                activityId,
                tags: current.activityId === activityId ? [...current.tags, tag] : [tag],
            }));
            setName('');
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

    return (
        <div
            className={`${styles.editor} ${setId ? styles.setEditor : styles.instanceEditor}`}
            ref={editorRef}
            role="group"
            aria-label={setId ? 'Set tags' : 'Activity tags'}
            onClick={(event) => event.stopPropagation()}
        >
            <div className={styles.tags}>
                {selectedTags.map((tag) => (
                    <label key={tag.id} className={`${styles.tag} ${selectedIds.includes(tag.id) ? styles.selected : ''}`} style={tag.color ? { '--tag-color': tag.color } : undefined}>
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(tag.id)}
                            disabled={isPending}
                            onChange={() => void persist(selectedIds.includes(tag.id) ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id]).catch(() => undefined)}
                        />
                        {tag.name}{tag.archived ? ' (archived)' : ''}
                    </label>
                ))}
                <Button
                    variant="secondary"
                    size="sm"
                    className={styles.addTag}
                    ref={triggerRef}
                    disabled={isPending}
                    aria-label="Add tag"
                    aria-expanded={isPickerOpen}
                    aria-haspopup="dialog"
                    onClick={() => (isPickerOpen ? closePicker() : setIsPickerOpen(true))}
                >
                    <span className={styles.addTagIcon} aria-hidden="true">+</span>
                    Tag
                </Button>
            </div>
            {isPickerOpen && (
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
                        {filteredAssignableTags.length ? filteredAssignableTags.map((tag) => (
                            <label key={`picker-${tag.id}`} className={styles.pickerOption} style={tag.color ? { '--tag-color': tag.color } : undefined}>
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
                </div>
            )}
        </div>
    );
}

export default ActivityTagEditor;
