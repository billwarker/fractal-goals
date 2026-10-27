import React, { useState } from 'react';

import Button from '../../atoms/Button';
import Modal from '../../atoms/Modal';
import ModalBody from '../../atoms/ModalBody';
import ModalFooter from '../../atoms/ModalFooter';
import CategoryPicker from './CategoryPicker';
import styles from './NotesFilters.module.css';

const errorText = (error) => error?.response?.data?.error || error?.message || 'The filter could not be saved. Try again.';
const MAX_CONDITIONS = 10;
let nextRow = 0;

/** Words and "quoted phrases", as the quick search splits them (mirrors keyword_terms on the server). */
export function keywordTerms(text = '') {
    return [...text.matchAll(/"([^"]+)"|(\S+)/g)].map(([, quoted, bare]) => (quoted || bare).trim()).filter(Boolean);
}

const row = (op, value) => ({ key: ++nextRow, op, value });

/** Conditions to start from: a saved filter's own, its legacy quick-search text, or the search bar. */
function initialRows(spec, searchText) {
    const rows = [
        ...(spec?.conditions || []).map((condition) => row(condition.op, condition.value)),
        ...keywordTerms(spec?.text).map((term) => row('contains', term)),
        ...keywordTerms(searchText).map((term) => row('contains', term)),
    ];
    return rows.length ? rows : [row('contains', '')];
}

/**
 * Create or edit a saved filter: keyword conditions (contains / equals a whole word or phrase)
 * matched all-or-any, plus categories, pinned and the goal/activity filters it was made with.
 */
export default function FilterModal({ filter = null, searchText = '', current, onSubmit, onClose }) {
    const spec = filter?.spec || {};
    const [name, setName] = useState(filter?.name || '');
    const [rows, setRows] = useState(() => initialRows(spec, searchText));
    const [match, setMatch] = useState(spec.match || 'all');
    const [categories, setCategories] = useState(filter ? spec.categories || [] : current.categories);
    const [pinnedOnly, setPinnedOnly] = useState(filter ? Boolean(spec.pinned_only) : current.pinnedOnly);
    const links = filter
        ? {
            goalIds: spec.goal_ids || (spec.goal_id ? [spec.goal_id] : []),
            activityIds: spec.activity_definition_ids || [],
            groupIds: spec.activity_group_ids || [],
        }
        : { goalIds: current.goalIds, activityIds: current.activityIds, groupIds: [] };
    const linkCount = links.activityIds.length + links.groupIds.length;
    const hasLinks = links.goalIds.length > 0 || linkCount > 0;
    const [includeLinks, setIncludeLinks] = useState(hasLinks);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const conditions = rows.filter((item) => item.value.trim()).map(({ op, value }) => ({ op, value: value.trim() }));
    const nextSpec = {
        conditions: conditions.length ? conditions : undefined,
        match: conditions.length > 1 ? match : undefined,
        categories: categories.length ? categories : undefined,
        pinned_only: pinnedOnly || undefined,
        ...(includeLinks ? {
            goal_ids: links.goalIds.length ? links.goalIds : undefined,
            activity_definition_ids: links.activityIds.length ? links.activityIds : undefined,
            activity_group_ids: links.groupIds.length ? links.groupIds : undefined,
        } : {}),
    };
    const hasCondition = Object.values(nextSpec).some((value) => value !== undefined);
    const updateRow = (key, changes) => setRows((items) => items.map((item) => (item.key === key ? { ...item, ...changes } : item)));
    const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const linkLabel = [links.goalIds.length && plural(links.goalIds.length, 'goal', 'goals'), linkCount && plural(linkCount, 'activity', 'activities')]
        .filter(Boolean).join(' and ');

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true); setError('');
        try {
            await onSubmit(name.trim(), nextSpec);
            onClose();
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen title={filter ? 'Edit filter' : 'Create filter'} onClose={onClose} size="sm">
            <form onSubmit={submit}>
                <ModalBody className={styles.modalForm}>
                    <label className={styles.field}>
                        <span>Name</span>
                        <input value={name} maxLength={60} autoFocus required placeholder="e.g. Form cues" onChange={(event) => setName(event.target.value)} />
                    </label>
                    <fieldset className={styles.field}>
                        <legend>Note text</legend>
                        <ul className={styles.conditions}>
                            {rows.map((item, index) => (
                                <li key={item.key} className={styles.condition}>
                                    <select aria-label={`Condition ${index + 1} match`} value={item.op}
                                        onChange={(event) => updateRow(item.key, { op: event.target.value })}>
                                        <option value="contains">contains</option>
                                        <option value="equals">equals</option>
                                    </select>
                                    <input aria-label={`Condition ${index + 1} text`} value={item.value} maxLength={200}
                                        placeholder={item.op === 'equals' ? 'a whole word or phrase' : 'any text'}
                                        onChange={(event) => updateRow(item.key, { value: event.target.value })} />
                                    {rows.length > 1 && (
                                        <button type="button" className={styles.removeCondition} aria-label={`Remove condition ${index + 1}`}
                                            onClick={() => setRows((items) => items.filter((other) => other.key !== item.key))}>×</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <div className={styles.sectionHeader}>
                            {rows.length < MAX_CONDITIONS && (
                                <button type="button" className={styles.linkButton} onClick={() => setRows((items) => [...items, row('contains', '')])}>
                                    + Add condition
                                </button>
                            )}
                            {conditions.length > 1 && (
                                <div className={styles.segments} role="radiogroup" aria-label="Match">
                                    {[['all', 'Match all (AND)'], ['any', 'Match any (OR)']].map(([value, label]) => (
                                        <button key={value} type="button" role="radio" className={styles.toggle}
                                            aria-checked={match === value} onClick={() => setMatch(value)}>{label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className={styles.hint}>“Equals” matches a whole word or phrase, so “lock” won’t match “lockout”.</p>
                    </fieldset>
                    <div className={styles.field}>
                        <span id="filter-categories">Categories <span className={styles.headerNote}>(none selected means any)</span></span>
                        <CategoryPicker value={categories} onChange={setCategories} labelledBy="filter-categories" />
                    </div>
                    <label className={styles.check}>
                        <input type="checkbox" checked={pinnedOnly} onChange={(event) => setPinnedOnly(event.target.checked)} />
                        Pinned notes only
                    </label>
                    {hasLinks && (
                        <label className={styles.check}>
                            <input type="checkbox" checked={includeLinks} onChange={(event) => setIncludeLinks(event.target.checked)} />
                            {filter ? `Keep its ${linkLabel} filter` : `Also match the current ${linkLabel}`}
                        </label>
                    )}
                    {!hasCondition && <p className={styles.hint}>Add some text or choose a category to save a filter.</p>}
                    {error && <p role="alert" className={styles.error}>{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button type="submit" disabled={busy || !name.trim() || !hasCondition}>{filter ? 'Save changes' : 'Create filter'}</Button>
                </ModalFooter>
            </form>
        </Modal>
    );
}
