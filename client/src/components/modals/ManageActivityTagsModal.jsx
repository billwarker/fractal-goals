import React, { useMemo, useState } from 'react';

import { useActivityTagCatalog, useActivityTagCatalogMutations } from '../../hooks/useActivityProgressViews';
import { fractalApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import styles from './ManageActivityTagsModal.module.css';

const DEFAULT_COLOR = '#64748B';
const emptyDraft = (activities) => ({ id: null, version: null, name: '', color: DEFAULT_COLOR, scope: 'selected', activityIds: activities[0]?.id ? [activities[0].id] : [], sortOrder: 0 });

const resultCount = (usage = {}) => Number(usage.instances || 0) + Number(usage.sets || 0);
const usageLabel = (usage = {}) => {
    const instances = resultCount(usage);
    return instances ? `${instances} instance${instances === 1 ? '' : 's'}` : 'Unused';
};

export default function ManageActivityTagsModal({ isOpen, onClose, rootId, activities }) {
    const { data = { tags: [], duplicate_groups: [] }, isLoading } = useActivityTagCatalog(rootId);
    const mutations = useActivityTagCatalogMutations(rootId);
    const [draft, setDraft] = useState(() => emptyDraft(activities));
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [activityFilter, setActivityFilter] = useState('all');
    const [usageFilter, setUsageFilter] = useState('all');
    const [duplicatesOnly, setDuplicatesOnly] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [deleteState, setDeleteState] = useState(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [mergeTarget, setMergeTarget] = useState(null);
    const [scopeImpact, setScopeImpact] = useState(null);

    const duplicateIds = useMemo(() => new Set(data.duplicate_groups.flatMap((group) => group.definition_ids)), [data.duplicate_groups]);
    const tagsById = useMemo(() => new Map(data.tags.map((tag) => [tag.id, tag])), [data.tags]);
    const filteredTags = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase();
        return data.tags.filter((tag) => {
            if (statusFilter === 'active' && tag.archived) return false;
            if (statusFilter === 'archived' && !tag.archived) return false;
            if (scopeFilter !== 'all' && tag.scope !== scopeFilter) return false;
            if (activityFilter !== 'all' && !tag.activity_ids.includes(activityFilter)) return false;
            if (usageFilter === 'used' && !resultCount(tag.usage)) return false;
            if (usageFilter === 'unused' && resultCount(tag.usage)) return false;
            if (duplicatesOnly && !duplicateIds.has(tag.id)) return false;
            return !needle || tag.name.toLocaleLowerCase().includes(needle)
                || tag.activities.some((activity) => activity.name.toLocaleLowerCase().includes(needle));
        });
    }, [activityFilter, data.tags, duplicateIds, duplicatesOnly, scopeFilter, search, statusFilter, usageFilter]);

    const resetDraft = () => setDraft(emptyDraft(activities));
    const edit = (tag) => setDraft({ id: tag.id, version: tag.version, name: tag.name, color: tag.color || DEFAULT_COLOR, scope: tag.scope, activityIds: tag.activity_ids, sortOrder: tag.sort_order });
    const toggleActivity = (activityId) => setDraft((current) => ({ ...current, activityIds: current.activityIds.includes(activityId) ? current.activityIds.filter((id) => id !== activityId) : [...current.activityIds, activityId] }));

    const saveDraft = async (payload) => {
        try {
            if (draft.id) await mutations.updateTag({ definitionId: draft.id, version: draft.version, ...payload });
            else await mutations.createTag(payload);
            notify.success(`${draft.id ? 'Updated' : 'Created'} “${payload.name}”`);
            resetDraft();
        } catch (error) { notify.error(`Failed to save tag: ${formatError(error)}`); }
    };

    const submit = async () => {
        if (!draft.name.trim() || (draft.scope === 'selected' && !draft.activityIds.length)) return;
        const payload = { name: draft.name.trim(), color: draft.color, scope: draft.scope, activity_ids: draft.scope === 'selected' ? draft.activityIds : [], sort_order: draft.sortOrder };
        const original = draft.id ? tagsById.get(draft.id) : null;
        const nextIds = draft.scope === 'global' ? new Set(activities.map((activity) => activity.id)) : new Set(draft.activityIds);
        const removed = original?.activities.filter((activity) => !nextIds.has(activity.id)) || [];
        if (removed.length) {
            setScopeImpact({ payload, tag: original, removed });
            return;
        }
        await saveDraft(payload);
    };

    const confirmScopeReduction = async () => {
        if (!scopeImpact) return;
        const { payload } = scopeImpact;
        setScopeImpact(null);
        await saveDraft(payload);
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

    const prepareMerge = async (tag) => {
        const group = data.duplicate_groups.find((candidate) => candidate.definition_ids.includes(tag.id));
        if (!group) return;
        const definitions = group.definition_ids.map((id) => tagsById.get(id)).filter(Boolean);
        const sources = definitions.filter((row) => row.id !== tag.id);
        const payload = { target_id: tag.id, source_ids: sources.map((row) => row.id), versions: Object.fromEntries(definitions.map((row) => [row.id, row.version])), scope: definitions.some((row) => row.scope === 'global') ? 'global' : 'selected' };
        try {
            const response = await fractalApi.previewActivityTagCatalogMerge(rootId, payload);
            setMergeTarget({ target: tag, sources, payload, preview: response.data });
        } catch (error) { notify.error(`Failed to preview merge: ${formatError(error)}`); }
    };

    const performMerge = async () => {
        if (!mergeTarget) return;
        try {
            await mutations.mergeTags(mergeTarget.payload);
            notify.success(`Merged duplicate tags into “${mergeTarget.target.name}”`);
            setMergeTarget(null);
        } catch (error) { notify.error(`Failed to merge tags: ${formatError(error)}`); }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen onClose={onClose} title="Manage Activity Tags" size="xl">
            <ModalBody>
                <div className={styles.layout}>
                    <section className={styles.catalog} aria-label="Tag catalog">
                        <div className={styles.summary}>
                            <div><strong>{data.tags.length} tags across {activities.length} activities</strong><span>{data.duplicate_groups.length ? `${data.duplicate_groups.length} duplicate group${data.duplicate_groups.length === 1 ? '' : 's'} ${data.duplicate_groups.length === 1 ? 'needs' : 'need'} review` : 'No duplicate names detected'}</span></div>
                            <Button size="sm" onClick={resetDraft}>New tag</Button>
                        </div>
                        <div className={styles.filters}>
                            <input type="search" aria-label="Search tags and activities" placeholder="Search tags or activities" value={search} onChange={(event) => setSearch(event.target.value)} />
                            <select aria-label="Filter tag status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All status</option></select>
                            <select aria-label="Filter tag scope" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}><option value="all">All scopes</option><option value="global">Every activity</option><option value="selected">Selected activities</option></select>
                            <select aria-label="Filter by activity" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="all">All activities</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
                            <select aria-label="Filter by usage" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All usage</option><option value="used">Used</option><option value="unused">Unused</option></select>
                            <label className={styles.checkFilter}><input type="checkbox" checked={duplicatesOnly} onChange={(event) => setDuplicatesOnly(event.target.checked)} /> Duplicates</label>
                        </div>
                        {isLoading ? <p className={styles.empty}>Loading tag catalog…</p> : (
                            <ul className={styles.list}>
                                {filteredTags.map((tag) => (
                                    <li key={tag.id} className={`${tag.archived ? styles.archived : ''} ${draft.id === tag.id ? styles.selected : ''}`}>
                                        <svg className={styles.swatch} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill={tag.color || DEFAULT_COLOR} /></svg>
                                        <button type="button" className={styles.identity} onClick={() => edit(tag)}><strong>{tag.name}</strong><span>{tag.scope === 'global' ? 'Every activity' : tag.activities.map((activity) => activity.name).join(', ') || 'No active activities'}</span></button>
                                        <span className={styles.usage}>{usageLabel(tag.usage)}</span>
                                        <Badge size="sm" className={styles.scopeLabel}>{tag.archived ? 'Archived' : tag.scope === 'global' ? 'Global' : `${tag.activity_ids.length} activit${tag.activity_ids.length === 1 ? 'y' : 'ies'}`}</Badge>
                                        <div className={styles.actions}>
                                            {duplicateIds.has(tag.id) && !tag.archived ? <button type="button" onClick={() => prepareMerge(tag)}>Merge</button> : null}
                                            {!tag.archived ? <button type="button" onClick={() => edit(tag)}>Edit</button> : <button type="button" onClick={() => restore(tag)}>Restore</button>}
                                            {!tag.archived ? <button type="button" onClick={() => setArchiveTarget(tag)}>Archive</button> : null}
                                            <button type="button" className={styles.danger} onClick={() => prepareDelete(tag)}>Delete</button>
                                        </div>
                                    </li>
                                ))}
                                {!filteredTags.length ? <li className={styles.empty}>No tags match these filters.</li> : null}
                            </ul>
                        )}
                    </section>
                    <section className={styles.editor} aria-label={draft.id ? `Edit ${draft.name}` : 'Create tag'}>
                        <div className={styles.editorHeader}><div><strong>{draft.id ? 'Edit tag' : 'Create a tag'}</strong><span>Names and colors update everywhere this tag appears.</span></div>{draft.id ? <Button size="sm" variant="secondary" onClick={resetDraft}>Cancel</Button> : null}</div>
                        <label><span>Name</span><input value={draft.name} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                        <label><span>Color</span><input className={styles.color} type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))} /></label>
                        <fieldset><legend>Available to</legend><label className={styles.radio}><input type="radio" name="tag-scope" checked={draft.scope === 'selected'} onChange={() => setDraft((current) => ({ ...current, scope: 'selected' }))} /> Selected activities</label><label className={styles.radio}><input type="radio" name="tag-scope" checked={draft.scope === 'global'} onChange={() => setDraft((current) => ({ ...current, scope: 'global' }))} /> Every activity in this fractal</label></fieldset>
                        {draft.scope === 'selected' ? <div className={styles.activityChoices} role="group" aria-label="Selected activities">{activities.map((activity) => <label key={activity.id}><input type="checkbox" checked={draft.activityIds.includes(activity.id)} onChange={() => toggleActivity(activity.id)} /> {activity.name}</label>)}</div> : <p className={styles.help}>This also becomes available to future activities.</p>}
                        <div className={styles.orderControl} role="group" aria-label="Picker order"><span>Picker order</span><div><Button size="sm" variant="secondary" aria-label="Move tag earlier" onClick={() => setDraft((current) => ({ ...current, sortOrder: Math.max(0, current.sortOrder - 1) }))} disabled={draft.sortOrder === 0}>Earlier</Button><output aria-live="polite">Position {draft.sortOrder + 1}</output><Button size="sm" variant="secondary" aria-label="Move tag later" onClick={() => setDraft((current) => ({ ...current, sortOrder: current.sortOrder + 1 }))}>Later</Button></div></div>
                        <Button onClick={submit} disabled={mutations.isPending || !draft.name.trim() || (draft.scope === 'selected' && !draft.activityIds.length)}>{draft.id ? 'Save changes' : 'Create tag'}</Button>
                    </section>
                </div>
            </ModalBody>
            <Modal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive tag?" size="sm" showCloseButton={false}><ModalBody><p className={styles.confirmCopy}>Archive “{archiveTarget?.name}”? Existing history and saved views keep their meaning, but it cannot be newly assigned.</p></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button variant="danger" onClick={performArchive} disabled={mutations.isPending}>Archive tag</Button></ModalFooter></Modal>
            <Modal isOpen={Boolean(deleteState)} onClose={() => setDeleteState(null)} title="Permanently delete tag?" size="sm" showCloseButton={false}><ModalBody><div className={styles.deleteWarning}><p>This cannot be undone. “{deleteState?.tag.name}” will be removed from historical results, saved views, and circuit scopes.</p><p>{deleteState ? usageLabel(deleteState.impact.usage) : ''}</p>{deleteState?.impact.usage.total ? <label><span>Type <strong>{deleteState.tag.name}</strong> to confirm</span><input autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label> : null}</div></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setDeleteState(null)}>Cancel</Button><Button variant="danger" onClick={performDelete} disabled={mutations.isPending || (Boolean(deleteState?.impact.usage.total) && deleteConfirmation.trim().toLocaleLowerCase() !== deleteState?.tag.name.trim().toLocaleLowerCase())}>Delete permanently</Button></ModalFooter></Modal>
            <Modal isOpen={Boolean(mergeTarget)} onClose={() => setMergeTarget(null)} title="Merge duplicate tags?" size="sm" showCloseButton={false}><ModalBody><div className={styles.deleteWarning}><p className={styles.confirmCopy}>Merge {mergeTarget?.sources.length || 0} duplicate{mergeTarget?.sources.length === 1 ? '' : 's'} into “{mergeTarget?.target.name}”? Existing activity and result tags will be consolidated automatically.</p>{mergeTarget?.preview ? <p>{mergeTarget.preview.activity_ids.length} activities · {usageLabel(mergeTarget.preview.usage)}</p> : null}</div></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setMergeTarget(null)}>Cancel</Button><Button onClick={performMerge} disabled={mutations.isPending}>Merge tags</Button></ModalFooter></Modal>
            <Modal isOpen={Boolean(scopeImpact)} onClose={() => setScopeImpact(null)} title="Reduce tag availability?" size="sm" showCloseButton={false}><ModalBody><div className={styles.deleteWarning}><p>“{scopeImpact?.tag.name}” will no longer be available to {scopeImpact?.removed.map((activity) => activity.name).join(', ')}.</p><p>{scopeImpact ? usageLabel(scopeImpact.tag.usage) : ''} remain historical and are not removed.</p></div></ModalBody><ModalFooter><Button variant="secondary" onClick={() => setScopeImpact(null)}>Cancel</Button><Button onClick={confirmScopeReduction} disabled={mutations.isPending}>Update availability</Button></ModalFooter></Modal>
        </Modal>
    );
}
