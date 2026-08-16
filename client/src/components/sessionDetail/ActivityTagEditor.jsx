import { useEffect, useRef, useState } from 'react';

import { useActivityTagMutations } from '../../hooks/useActivityProgressViews';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import styles from './ActivityTagEditor.module.css';

function ActivityTagEditor({ rootId, activityId, instanceId = null, setId = null, availableTags = [], tags = [], inheritedTags = [] }) {
    const assignmentKey = setId || instanceId;
    const editorRef = useRef(null);
    const [optimisticSelection, setOptimisticSelection] = useState(null);
    const [createdTags, setCreatedTags] = useState({ activityId, tags: [] });
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [name, setName] = useState('');
    const { createTag, assignInstanceTags, assignSetTags, isPending } = useActivityTagMutations(rootId, activityId);
    const selectedIds = optimisticSelection?.assignmentKey === assignmentKey
        ? optimisticSelection.ids
        : tags.map((tag) => tag.id);
    const pendingCreatedTags = createdTags.activityId === activityId ? createdTags.tags : [];
    const availableTagIds = new Set(availableTags.map((tag) => tag.id));
    const localTags = [
        ...availableTags,
        ...pendingCreatedTags.filter((tag) => !availableTagIds.has(tag.id)),
    ];
    const inheritedIds = new Set(inheritedTags.map((tag) => tag.id));
    const assignableTags = localTags.filter((tag) => !tag.archived && !inheritedIds.has(tag.id));
    const selectedTags = assignableTags.filter((tag) => selectedIds.includes(tag.id));

    useEffect(() => {
        if (!isPickerOpen) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!editorRef.current?.contains(event.target)) setIsPickerOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setIsPickerOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isPickerOpen]);

    const persist = async (nextIds) => {
        setOptimisticSelection({ assignmentKey, ids: nextIds });
        try {
            if (setId) await assignSetTags({ setId, tagIds: nextIds });
            else await assignInstanceTags({ instanceId, tagIds: nextIds });
        } catch (error) {
            notify.error(`Failed to update tags: ${formatError(error)}`);
        } finally {
            setOptimisticSelection(null);
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
            await persist([...selectedIds, tag.id]);
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
                            onChange={() => persist(selectedIds.includes(tag.id) ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id])}
                        />
                        {tag.name}
                    </label>
                ))}
                <Button
                    variant="secondary"
                    size="sm"
                    className={styles.addTag}
                    disabled={isPending}
                    aria-label="Add tag"
                    aria-expanded={isPickerOpen}
                    aria-haspopup="dialog"
                    onClick={() => setIsPickerOpen((open) => !open)}
                >
                    <span className={styles.addTagIcon} aria-hidden="true">+</span>
                    Tag
                </Button>
            </div>
            {isPickerOpen && (
                <div className={styles.picker} role="dialog" aria-label={setId ? 'Choose set tags' : 'Choose activity tags'}>
                    <div className={styles.pickerHeader}>
                        <span>Choose tags</span>
                        <button type="button" className={styles.pickerClose} aria-label="Close tag picker" onClick={() => setIsPickerOpen(false)}>×</button>
                    </div>
                    <div className={styles.pickerOptions}>
                        {assignableTags.length ? assignableTags.map((tag) => (
                            <label key={`picker-${tag.id}`} className={styles.pickerOption} style={tag.color ? { '--tag-color': tag.color } : undefined}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(tag.id)}
                                    disabled={isPending}
                                    onChange={() => persist(selectedIds.includes(tag.id)
                                        ? selectedIds.filter((id) => id !== tag.id)
                                        : [...selectedIds, tag.id])}
                                />
                                <span className={styles.pickerOptionDot} aria-hidden="true" />
                                <span>{tag.name}</span>
                            </label>
                        )) : (
                            <span className={styles.pickerEmpty}>No existing tags</span>
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
