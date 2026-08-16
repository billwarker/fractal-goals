import React, { useEffect, useState } from 'react';

import { useActivityTagMutations, useActivityTags } from '../../hooks/useActivityProgressViews';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import styles from './ManageActivityTagsModal.module.css';

const DEFAULT_COLOR = '#64748B';

export default function ManageActivityTagsModal({ isOpen, onClose, rootId, activities }) {
    const [activityId, setActivityId] = useState('');
    const [name, setName] = useState('');
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [sortOrder, setSortOrder] = useState('');
    const [editingId, setEditingId] = useState(null);
    const selectedId = activityId || activities[0]?.id || '';
    const { data: tags = [], isLoading } = useActivityTags(rootId, selectedId);
    const { createTag, updateTag, archiveTag, isPending } = useActivityTagMutations(rootId, selectedId);

    useEffect(() => {
        if (selectedId && !activities.some((activity) => activity.id === selectedId)) {
            setActivityId(activities[0]?.id || '');
        }
    }, [activities, selectedId]);

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setColor(DEFAULT_COLOR);
        setSortOrder('');
    };

    const submit = async () => {
        if (!name.trim() || !selectedId) return;
        try {
            if (editingId) {
                await updateTag({ tagId: editingId, name: name.trim(), color, sort_order: Number(sortOrder || 0) });
            } else {
                await createTag({ name: name.trim(), color, ...(sortOrder === '' ? {} : { sort_order: Number(sortOrder) }) });
            }
            resetForm();
        } catch (error) {
            notify.error(`Failed to save tag: ${formatError(error)}`);
        }
    };

    const edit = (tag) => {
        setEditingId(tag.id);
        setName(tag.name);
        setColor(tag.color || DEFAULT_COLOR);
        setSortOrder(String(tag.sort_order ?? 0));
    };

    const archive = async (tag) => {
        if (!window.confirm(`Archive “${tag.name}”? Existing history and saved views will keep using it.`)) return;
        try {
            await archiveTag(tag.id);
            if (editingId === tag.id) resetForm();
        } catch (error) {
            notify.error(`Failed to archive tag: ${formatError(error)}`);
        }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen onClose={onClose} title="Manage Activity Tags" size="lg">
            <ModalBody>
                <div className={styles.content}>
                    <label className={styles.activityField}>
                        <span>Activity</span>
                        <select value={selectedId} onChange={(event) => { setActivityId(event.target.value); resetForm(); }}>
                            {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
                        </select>
                    </label>
                    {!activities.length ? <p className={styles.empty}>Create an activity before adding tags.</p> : (
                        <>
                            <div className={styles.form}>
                                <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
                                <label><span>Color</span><input type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></label>
                                <label><span>Order</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></label>
                                <Button onClick={submit} disabled={!name.trim() || isPending}>{editingId ? 'Save tag' : 'Add tag'}</Button>
                                {editingId ? <Button variant="secondary" onClick={resetForm}>Cancel</Button> : null}
                            </div>
                            {isLoading ? <p className={styles.empty}>Loading tags…</p> : (
                                <ul className={styles.list}>
                                    {tags.map((tag) => (
                                        <li key={tag.id} className={tag.archived ? styles.archived : ''}>
                                            <span className={styles.swatch} style={{ backgroundColor: tag.color || DEFAULT_COLOR }} />
                                            <span className={styles.name}>{tag.name}{tag.archived ? ' (archived)' : ''}</span>
                                            <span className={styles.order}>#{tag.sort_order + 1}</span>
                                            {!tag.archived ? <>
                                                <button type="button" onClick={() => edit(tag)}>Edit</button>
                                                <button type="button" onClick={() => archive(tag)}>Archive</button>
                                            </> : null}
                                        </li>
                                    ))}
                                    {!tags.length ? <li className={styles.empty}>No tags for this activity yet.</li> : null}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </ModalBody>
        </Modal>
    );
}
