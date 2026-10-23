import React, { useMemo, useState } from 'react';

import { useActivityTagCatalog, useActivityTagCatalogMutations } from '../../hooks/useActivityTags';
import { fractalApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { canonicalTagName, findTagByName } from '../../utils/tagNames';
import { groupTagsForPicker, OTHER_TAGS_KEY } from '../../utils/tagPickerOptions';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import styles from './ManageActivityTagsModal.module.css';

const DEFAULT_COLOR = '#64748B';
const emptyTagDraft = () => ({ kind: 'tag', id: null, version: null, name: '', color: DEFAULT_COLOR, familyId: '' });
const emptyFamilyDraft = () => ({ kind: 'family', id: null, version: null, name: '', singleSelect: false });

// Distinct activity instances: a tag on an instance and on its sets counts once.
const resultCount = (usage = {}) => Number(usage.tagged_instances ?? (Number(usage.instances || 0) + Number(usage.sets || 0)));
const usageLabel = (usage = {}) => {
    const instances = resultCount(usage);
    return instances ? `${instances} instance${instances === 1 ? '' : 's'}` : 'Unused';
};
const move = (ids, id, offset) => {
    const index = ids.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= ids.length) return null;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};

export default function ManageActivityTagsModal({ isOpen, onClose, rootId, activities }) {
    const { data: catalog, isLoading } = useActivityTagCatalog(rootId);
    const mutations = useActivityTagCatalogMutations(rootId);
    const [draft, setDraft] = useState(emptyTagDraft);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [activityFilter, setActivityFilter] = useState('all');
    const [usageFilter, setUsageFilter] = useState('all');
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [deleteState, setDeleteState] = useState(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [mergeState, setMergeState] = useState(null);
    const [confirmMerge, setConfirmMerge] = useState(false);
    const [familyDelete, setFamilyDelete] = useState(null);

    const tagsById = useMemo(() => new Map(catalog.tags.map((tag) => [tag.id, tag])), [catalog.tags]);
    const families = catalog.families;
    const allGroups = useMemo(() => groupTagsForPicker(catalog, { includeArchived: true }), [catalog]);
    const groups = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase();
        const matches = (tag) => {
            if (statusFilter === 'active' && tag.archived) return false;
            if (statusFilter === 'archived' && !tag.archived) return false;
            if (activityFilter !== 'all' && !tag.activities.some((activity) => activity.id === activityFilter)) return false;
            if (usageFilter === 'used' && !resultCount(tag.usage)) return false;
            if (usageFilter === 'unused' && resultCount(tag.usage)) return false;
            return !needle || tag.name.toLocaleLowerCase().includes(needle)
                || tag.activities.some((activity) => activity.name.toLocaleLowerCase().includes(needle));
        };
        const filtering = Boolean(needle) || statusFilter !== 'active' || activityFilter !== 'all' || usageFilter !== 'all';
        const byKey = new Map(allGroups.map((group) => [group.key, group]));
        // Families stay visible while unfiltered (even when empty) so tags can be moved into them.
        const familyGroups = [...families].sort((a, b) => a.sort_order - b.sort_order).map((family) => ({
            key: family.id,
            family,
            label: family.name,
            singleSelect: family.single_select,
            tags: (byKey.get(family.id)?.tags || []).filter(matches),
        }));
        const other = { key: OTHER_TAGS_KEY, family: null, label: families.length ? 'Other tags' : 'Tags', tags: (byKey.get(OTHER_TAGS_KEY)?.tags || []).filter(matches) };
        return [...familyGroups, other].filter((group) => group.tags.length || (!filtering && group.family));
    }, [activityFilter, allGroups, families, search, statusFilter, usageFilter]);
    const shownCount = groups.reduce((total, group) => total + group.tags.length, 0);

    const editingTag = draft.kind === 'tag' && draft.id ? tagsById.get(draft.id) : null;
    const nameCollision = draft.kind === 'tag' ? findTagByName(catalog.tags, draft.name) : null;
    const collidesWithOther = nameCollision && nameCollision.id !== draft.id ? nameCollision : null;
    const familyCollision = draft.kind === 'family'
        ? families.find((family) => family.id !== draft.id && canonicalTagName(family.name).toLowerCase() === canonicalTagName(draft.name).toLowerCase())
        : null;

    // The right panel shows one task at a time: a tag, a family, or a merge.
    const resetDraft = () => { setMergeState(null); setDraft(emptyTagDraft()); };
    const startFamily = () => { setMergeState(null); setDraft(emptyFamilyDraft()); };
    const editTag = (tag) => {
        setMergeState(null);
        setDraft({ kind: 'tag', id: tag.id, version: tag.version, name: tag.name, color: tag.color || DEFAULT_COLOR, familyId: tag.family_id || '' });
    };
    const editFamily = (family) => {
        setMergeState(null);
        setDraft({ kind: 'family', id: family.id, version: family.version, name: family.name, singleSelect: family.single_select });
    };

    const tagChanged = !editingTag || canonicalTagName(draft.name) !== editingTag.name
        || draft.color !== (editingTag.color || DEFAULT_COLOR) || (draft.familyId || null) !== (editingTag.family_id || null);
    const saveTag = async () => {
        const name = canonicalTagName(draft.name);
        if (!name || collidesWithOther) return;
        const payload = { name, color: draft.color, family_id: draft.familyId || null };
        try {
            if (draft.id) await mutations.updateTag({ definitionId: draft.id, version: draft.version, ...payload });
            else await mutations.createTag(payload);
            notify.success(`${draft.id ? 'Updated' : 'Created'} “${name}”`);
            resetDraft();
        } catch (error) { notify.error(`Failed to save tag: ${formatError(error)}`); }
    };

    const editingFamily = draft.kind === 'family' && draft.id ? families.find((family) => family.id === draft.id) : null;
    const familyChanged = !editingFamily || canonicalTagName(draft.name) !== editingFamily.name
        || draft.singleSelect !== editingFamily.single_select;
    const saveFamily = async () => {
        const name = canonicalTagName(draft.name);
        if (!name || familyCollision) return;
        try {
            const response = draft.id
                ? await mutations.updateFamily({ familyId: draft.id, version: draft.version, name, single_select: draft.singleSelect })
                : await mutations.createFamily({ name, single_select: draft.singleSelect });
            const conflicts = response?.data?.conflicting_assignments;
            notify.success(conflicts
                ? `Saved “${name}”. ${conflicts} past entr${conflicts === 1 ? 'y holds' : 'ies hold'} more than one of its tags; new changes allow one.`
                : `${draft.id ? 'Updated' : 'Created'} tag family “${name}”`);
            resetDraft();
        } catch (error) { notify.error(`Failed to save tag family: ${formatError(error)}`); }
    };

    const reorderTag = async (group, tag, offset) => {
        // Reorder within the whole family, not just the rows a filter shows.
        const fullGroup = allGroups.find((candidate) => candidate.key === group.key) || group;
        const ids = move(fullGroup.tags.map((row) => row.id), tag.id, offset);
        if (!ids) return;
        try { await mutations.reorderTags({ family_id: group.family?.id || null, tag_ids: ids }); }
        catch (error) { notify.error(`Failed to reorder tags: ${formatError(error)}`); }
    };

    const reorderFamily = async (family, offset) => {
        const ids = move([...families].sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id), family.id, offset);
        if (!ids) return;
        try { await mutations.reorderFamilies(ids); }
        catch (error) { notify.error(`Failed to reorder tag families: ${formatError(error)}`); }
    };

    const performArchive = async () => {
        if (!archiveTarget) return;
        try {
            await mutations.archiveTag({ definitionId: archiveTarget.id, version: archiveTarget.version });
            if (draft.id === archiveTarget.id) resetDraft();
            notify.success(`Archived “${archiveTarget.name}”`);
        } catch (error) { notify.error(`Failed to archive tag: ${formatError(error)}`); }
        finally { setArchiveTarget(null); }
    };

    const restore = async (tag) => {
        try { await mutations.restoreTag({ definitionId: tag.id, version: tag.version }); notify.success(`Restored “${tag.name}”`); }
        catch (error) { notify.error(`Failed to restore tag: ${formatError(error)}`); }
    };

    const prepareDelete = async (tag) => {
        try {
            const response = await fractalApi.getActivityTagImpact(rootId, tag.id);
            setDeleteState({ tag, impact: response.data });
            setDeleteConfirmation('');
        } catch (error) { notify.error(`Failed to inspect tag: ${formatError(error)}`); }
    };

    const performDelete = async () => {
        if (!deleteState) return;
        try {
            await mutations.hardDeleteTag({ definitionId: deleteState.tag.id, version: deleteState.tag.version, confirmation_name: deleteConfirmation || deleteState.tag.name });
            if (draft.id === deleteState.tag.id) resetDraft();
            notify.success(`Permanently deleted “${deleteState.tag.name}”`);
            setDeleteState(null);
        } catch (error) { notify.error(`Failed to delete tag: ${formatError(error)}`); }
    };

    const openMerge = async (source, targetId = '') => {
        setMergeState({ source, targetId, preview: null });
        const target = tagsById.get(targetId);
        if (!target) return;
        const payload = {
            target_id: target.id,
            source_ids: [source.id],
            versions: { [target.id]: target.version, [source.id]: source.version },
        };
        try {
            const response = await fractalApi.previewActivityTagCatalogMerge(rootId, payload);
            setMergeState((current) => (current?.source.id === source.id && current.targetId === targetId
                ? { ...current, payload, preview: response.data } : current));
        } catch (error) { notify.error(`Failed to preview merge: ${formatError(error)}`); }
    };
    const performMerge = async () => {
        if (!mergeState?.payload) return;
        const target = tagsById.get(mergeState.targetId);
        setConfirmMerge(false);
        try {
            await mutations.mergeTags(mergeState.payload);
            notify.success(`Merged “${mergeState.source.name}” into “${target?.name}”`);
            resetDraft();
        } catch (error) { notify.error(`Failed to merge tags: ${formatError(error)}`); }
    };
    // Recorded history moves to the target, so a merge that moves instances asks first.
    const mergeMovedCount = mergeState ? resultCount(tagsById.get(mergeState.source.id)?.usage) : 0;
    const requestMerge = () => (mergeMovedCount ? setConfirmMerge(true) : performMerge());

    const performFamilyDelete = async () => {
        if (!familyDelete) return;
        try {
            await mutations.deleteFamily({ familyId: familyDelete.id, version: familyDelete.version });
            if (draft.kind === 'family' && draft.id === familyDelete.id) resetDraft();
            notify.success(`Deleted tag family “${familyDelete.name}”; its tags moved to Other tags`);
        } catch (error) { notify.error(`Failed to delete tag family: ${formatError(error)}`); }
        finally { setFamilyDelete(null); }
    };

    if (!isOpen) return null;
    const orderedFamilies = [...families].sort((a, b) => a.sort_order - b.sort_order);
    const activeTagCount = catalog.tags.filter((tag) => !tag.archived).length;
    return (
        <Modal isOpen onClose={onClose} title="Manage Activity Tags" size="xl">
            <ModalBody>
                <div className={styles.layout}>
                    <section className={styles.catalog} aria-label="Tag catalog">
                        <div className={styles.summary}>
                            <div>
                                <strong>{activeTagCount} tag{activeTagCount === 1 ? '' : 's'} · {families.length} tag famil{families.length === 1 ? 'y' : 'ies'}</strong>
                                <span>Any tag can be used on any activity. Tag families group tags in pickers.</span>
                            </div>
                            <div className={styles.summaryActions}>
                                <Button size="sm" variant="secondary" onClick={startFamily}>New tag family</Button>
                                <Button size="sm" onClick={resetDraft}>New tag</Button>
                            </div>
                        </div>
                        <div className={styles.filters}>
                            <input type="search" aria-label="Search tags and activities" placeholder="Search tags or activities" value={search} onChange={(event) => setSearch(event.target.value)} />
                            <select aria-label="Filter tag status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All status</option></select>
                            <select aria-label="Filter by activity" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="all">Used on any activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
                            <select aria-label="Filter by usage" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All usage</option><option value="used">Used</option><option value="unused">Unused</option></select>
                        </div>
                        {isLoading ? <p className={styles.empty}>Loading tag catalog…</p> : (
                            <div className={styles.groups}>
                                {groups.map((group) => (
                                    <section key={group.key} className={styles.group} aria-label={group.label}>
                                        <header className={styles.groupHeader}>
                                            <div>
                                                <strong>{group.label}</strong>
                                                {group.singleSelect ? <Badge size="sm">Single select</Badge> : null}
                                            </div>
                                            {group.family ? (
                                                <div className={styles.actions}>
                                                    <button type="button" aria-label={`Move ${group.label} earlier`} disabled={orderedFamilies[0]?.id === group.family.id} onClick={() => reorderFamily(group.family, -1)}>↑</button>
                                                    <button type="button" aria-label={`Move ${group.label} later`} disabled={orderedFamilies.at(-1)?.id === group.family.id} onClick={() => reorderFamily(group.family, 1)}>↓</button>
                                                    <button type="button" aria-label={`Edit tag family ${group.label}`} onClick={() => editFamily(group.family)}>Edit</button>
                                                    <button type="button" aria-label={`Delete tag family ${group.label}`} className={styles.danger} onClick={() => setFamilyDelete(group.family)}>Delete</button>
                                                </div>
                                            ) : null}
                                        </header>
                                        <ul className={styles.list}>
                                            {group.tags.map((tag, index) => {
                                                // While merging, the list picks the target: rows become choices.
                                                const isSource = mergeState?.source.id === tag.id;
                                                const isTarget = mergeState?.targetId === tag.id;
                                                const canTarget = Boolean(mergeState) && !isSource && !tag.archived;
                                                const rowState = mergeState
                                                    ? `${isSource ? styles.mergeSource : ''} ${isTarget ? styles.mergeTarget : ''} ${canTarget ? styles.mergeChoice : ''}`
                                                    : draft.kind === 'tag' && draft.id === tag.id ? styles.selected : '';
                                                return (
                                                    <li key={tag.id} className={`${tag.archived ? styles.archived : ''} ${rowState}`}>
                                                        <svg className={styles.swatch} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={tag.color || DEFAULT_COLOR} /></svg>
                                                        <button
                                                            type="button"
                                                            className={styles.identity}
                                                            disabled={Boolean(mergeState) && !canTarget}
                                                            aria-pressed={mergeState ? isTarget : undefined}
                                                            aria-label={mergeState ? (canTarget ? `Merge ${mergeState.source.name} into ${tag.name}` : undefined) : `Edit ${tag.name}`}
                                                            onClick={() => {
                                                                if (!mergeState) editTag(tag);
                                                                else if (canTarget) openMerge(mergeState.source, tag.id);
                                                            }}
                                                        >
                                                            <strong>{tag.name}</strong>
                                                            <span>{tag.activities.length ? `Used on ${tag.activities.map((activity) => activity.name).join(', ')}` : 'Not used yet'}</span>
                                                        </button>
                                                        <span className={styles.usage}>{tag.archived ? 'Archived' : usageLabel(tag.usage)}</span>
                                                        {mergeState ? (
                                                            <span className={styles.mergeRole}>{isSource ? 'Merging' : isTarget ? 'Merge into' : canTarget ? 'Choose' : ''}</span>
                                                        ) : (
                                                            <div className={styles.actions}>
                                                                <button type="button" aria-label={`Move ${tag.name} earlier`} disabled={index === 0} onClick={() => reorderTag(group, tag, -1)}>↑</button>
                                                                <button type="button" aria-label={`Move ${tag.name} later`} disabled={index === group.tags.length - 1} onClick={() => reorderTag(group, tag, 1)}>↓</button>
                                                                {tag.archived ? <button type="button" aria-label={`Restore ${tag.name}`} onClick={() => restore(tag)}>Restore</button> : null}
                                                                <button type="button" aria-label={`Merge ${tag.name} into another tag`} onClick={() => openMerge(tag)}>Merge…</button>
                                                                {!tag.archived ? <button type="button" aria-label={`Archive ${tag.name}`} onClick={() => setArchiveTarget(tag)}>Archive</button> : null}
                                                                <button type="button" aria-label={`Delete ${tag.name}`} className={styles.danger} onClick={() => prepareDelete(tag)}>Delete</button>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                            {!group.tags.length ? <li className={styles.empty}>No tags in this tag family yet. Open a tag to move it here.</li> : null}
                                        </ul>
                                    </section>
                                ))}
                                {!shownCount && !groups.length ? <p className={styles.empty}>{catalog.tags.length ? 'No tags match these filters.' : 'No tags yet. Create one, or add tags from any activity in a session.'}</p> : null}
                            </div>
                        )}
                    </section>
                    {mergeState ? (
                        <section className={styles.editor} aria-label={`Merge ${mergeState.source.name}`}>
                            <div className={styles.editorHeader}>
                                <div><strong>Merge “{mergeState.source.name}”</strong><span>Pick the tag it should become from the list.</span></div>
                            </div>
                            <div className={styles.mergeInto}>
                                <span>Merge into</span>
                                {tagsById.get(mergeState.targetId) ? (
                                    <strong>
                                        <svg className={styles.swatch} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={tagsById.get(mergeState.targetId).color || DEFAULT_COLOR} /></svg>
                                        {tagsById.get(mergeState.targetId).name}
                                    </strong>
                                ) : <em>Choose a tag in the list.</em>}
                            </div>
                            <p className={styles.help}>
                                {tagsById.get(mergeState.targetId)
                                    ? `Every activity, set, plan, and circuit using “${mergeState.source.name}” will use “${tagsById.get(mergeState.targetId).name}” instead, and “${mergeState.source.name}” is removed. This cannot be undone.`
                                    : `Every activity, set, plan, and circuit using “${mergeState.source.name}” will use the tag you choose instead, and “${mergeState.source.name}” is removed.`}
                            </p>
                            {mergeState.preview ? <p className={styles.mergePreview} role="status">{mergeState.preview.activities.length} activit{mergeState.preview.activities.length === 1 ? 'y' : 'ies'} · {usageLabel(mergeState.preview.usage)} after merging</p> : null}
                            <div className={styles.editorActions}>
                                <Button variant="secondary" onClick={() => setMergeState(null)}>Cancel</Button>
                                <Button onClick={requestMerge} disabled={mutations.isPending || !mergeState.preview}>Merge tags</Button>
                            </div>
                        </section>
                    ) : draft.kind === 'family' ? (
                        <section className={styles.editor} aria-label={draft.id ? `Edit tag family ${draft.name}` : 'Create tag family'}>
                            <div className={styles.editorHeader}><div><strong>{draft.id ? 'Edit tag family' : 'Create a tag family'}</strong><span>Tags in a tag family appear together, in order, in every tag picker.</span></div><Button size="sm" variant="secondary" onClick={resetDraft}>Cancel</Button></div>
                            <label><span>Name</span><input value={draft.name} maxLength={100} placeholder="e.g. Grip, Intensity, Surface" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                            {familyCollision ? <p className={styles.collision} role="alert">A tag family named “{familyCollision.name}” already exists.</p> : null}
                            <label className={styles.checkRow}>
                                <input type="checkbox" checked={draft.singleSelect} onChange={(event) => setDraft((current) => ({ ...current, singleSelect: event.target.checked }))} />
                                <span><strong>Single select</strong> An activity or set can have only one tag from this family. Choosing another replaces it.</span>
                            </label>
                            <Button onClick={saveFamily} disabled={mutations.isPending || !familyChanged || !canonicalTagName(draft.name) || Boolean(familyCollision)}>{draft.id ? 'Save tag family' : 'Create tag family'}</Button>
                        </section>
                    ) : (
                        <section className={styles.editor} aria-label={draft.id ? `Edit ${draft.name}` : 'Create tag'}>
                            <div className={styles.editorHeader}><div><strong>{draft.id ? 'Edit tag' : 'Create a tag'}</strong><span>Names and colors update everywhere this tag appears.</span></div>{draft.id ? <Button size="sm" variant="secondary" onClick={resetDraft}>Cancel</Button> : null}</div>
                            <label><span>Name</span><input value={draft.name} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                            {collidesWithOther ? (
                                <div className={styles.collision} role="alert">
                                    <span>{collidesWithOther.archived ? `An archived tag named “${collidesWithOther.name}” already exists.` : `“${collidesWithOther.name}” already exists.`}</span>
                                    {collidesWithOther.archived
                                        ? <button type="button" onClick={() => restore(collidesWithOther)}>Restore it</button>
                                        : editingTag
                                            ? <button type="button" onClick={() => openMerge(editingTag, collidesWithOther.id)}>Merge into it</button>
                                            : <button type="button" onClick={() => editTag(collidesWithOther)}>Edit it</button>}
                                </div>
                            ) : null}
                            <label><span>Color</span><input className={styles.color} type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))} /></label>
                            <label><span>Tag family</span>
                                <select value={draft.familyId} onChange={(event) => setDraft((current) => ({ ...current, familyId: event.target.value }))}>
                                    <option value="">No tag family (Other tags)</option>
                                    {orderedFamilies.map((family) => <option key={family.id} value={family.id}>{family.name}{family.single_select ? ' · single select' : ''}</option>)}
                                </select>
                            </label>
                            <Button onClick={saveTag} disabled={mutations.isPending || !tagChanged || !canonicalTagName(draft.name) || Boolean(collidesWithOther)}>{draft.id ? 'Save changes' : 'Create tag'}</Button>
                            {editingTag ? (
                                <section className={styles.usedOn} aria-label={`Activities using ${editingTag.name}`}>
                                    <h4>{editingTag.activities.length ? `Used on ${editingTag.activities.length} activit${editingTag.activities.length === 1 ? 'y' : 'ies'}` : 'Not used on any activity yet'}</h4>
                                    {editingTag.activities.length ? (
                                        <ul>
                                            {editingTag.activities.map((activity) => (
                                                <li key={activity.id}>
                                                    <span>{activity.name}</span>
                                                    <span>{activity.instances} instance{activity.instances === 1 ? '' : 's'}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            ) : null}
                        </section>
                    )}
                </div>
            </ModalBody>
            <Modal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive tag?" size="sm" showCloseButton={false}><ModalBody><p className={styles.confirmCopy}>Archive “{archiveTarget?.name}”? Existing history keeps the tag, but it cannot be newly assigned. Its name stays reserved until you restore or delete it.</p></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button variant="danger" onClick={performArchive} disabled={mutations.isPending}>Archive tag</Button></ModalFooter></Modal>
            <Modal isOpen={Boolean(deleteState)} onClose={() => setDeleteState(null)} title="Permanently delete tag?" size="sm" showCloseButton={false}><ModalBody><div className={styles.deleteWarning}><p>This cannot be undone. “{deleteState?.tag.name}” will be removed from historical results, plans, and circuit scopes.</p><p>{deleteState ? usageLabel(deleteState.impact.usage) : ''}</p>{deleteState?.impact.usage.total ? <label><span>Type <strong>{deleteState.tag.name}</strong> to confirm</span><input autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label> : null}</div></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setDeleteState(null)}>Cancel</Button><Button variant="danger" onClick={performDelete} disabled={mutations.isPending || (Boolean(deleteState?.impact.usage.total) && deleteConfirmation.trim().toLocaleLowerCase() !== deleteState?.tag.name.trim().toLocaleLowerCase())}>Delete permanently</Button></ModalFooter></Modal>
            <Modal isOpen={confirmMerge && Boolean(mergeState)} onClose={() => setConfirmMerge(false)} title="Merge tags?" size="sm" showCloseButton={false}>
                <ModalBody>
                    <div className={styles.deleteWarning}>
                        <p>{usageLabel(tagsById.get(mergeState?.source.id)?.usage)} tagged “{mergeState?.source.name}” will move to “{tagsById.get(mergeState?.targetId)?.name}”, and “{mergeState?.source.name}” will be removed.</p>
                        <p>This cannot be undone.</p>
                    </div>
                </ModalBody>
                <ModalFooter><Button variant="secondary" onClick={() => setConfirmMerge(false)}>Cancel</Button><Button onClick={performMerge} disabled={mutations.isPending}>Merge tags</Button></ModalFooter>
            </Modal>
            <Modal isOpen={Boolean(familyDelete)} onClose={() => setFamilyDelete(null)} title="Delete tag family?" size="sm" showCloseButton={false}><ModalBody><p className={styles.confirmCopy}>Delete the tag family “{familyDelete?.name}”? Its tags are kept and move to Other tags.</p></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setFamilyDelete(null)}>Cancel</Button><Button variant="danger" onClick={performFamilyDelete} disabled={mutations.isPending}>Delete tag family</Button></ModalFooter></Modal>
        </Modal>
    );
}
