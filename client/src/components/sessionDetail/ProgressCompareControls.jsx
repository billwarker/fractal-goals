import React, { useState } from 'react';

import { useActivityTagCatalog, useProgressComparisonMutation } from '../../hooks/useActivityTags';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { familiesWithMembers, groupTagsForPicker, toggleTagSelection } from '../../utils/tagPickerOptions';
import ChevronIcon from '../atoms/ChevronIcon';
import ActivityTagBadges from '../common/ActivityTagBadges';
import styles from './ProgressPanel.module.css';

const MODES = [
    ['same_tags', 'Same tags'],
    ['tags', 'Specific tags'],
    ['all', 'All history'],
];

// Per viewer: whether the widget is open for this activity in this template/program day. A choice
// remembered there starts collapsed, since it rarely needs adjusting again.
const openStorageKey = (activityId, context) => (
    `progress-compare-open:${activityId}:${context.template?.id || ''}:${context.program_day?.id || ''}`
);

function readOpen(key, fallback) {
    try {
        const stored = window.localStorage.getItem(key);
        return stored === null ? fallback : stored === 'true';
    } catch {
        return fallback;
    }
}

function writeOpen(key, open) {
    try {
        window.localStorage.setItem(key, String(open));
    } catch {
        // Storage can be unavailable (private mode); the widget still works for this view.
    }
}

/** The comparison an instance's context names, in the shape the progress hooks take. */
export function comparisonChoice(instance) {
    const context = instance?.comparison_context || {};
    const mode = context.mode || 'same_tags';
    return {
        mode,
        tagIds: mode === 'tags' ? context.tag_ids || [] : mode === 'same_tags' ? (instance?.tags || []).map((tag) => tag.id) : [],
        sameTemplate: Boolean(context.same_template),
        sameProgramDay: Boolean(context.same_program_day),
    };
}

/**
 * What this instance's ▲/▼ hints compare against: which tags, and optionally only past
 * sessions from the same session template and/or program day. Saved on the instance and
 * remembered for the activity in that template/program day.
 */
export default function ProgressCompareControls({ rootId, activityId, instance, timeline }) {
    const context = instance.comparison_context || { mode: 'same_tags', tag_ids: [], tags: [] };
    const choice = comparisonChoice(instance);
    const { setComparison, isPending } = useProgressComparisonMutation(rootId, activityId);
    const { data: catalog } = useActivityTagCatalog(rootId);
    const storageKey = openStorageKey(activityId, context);
    const [open, setOpen] = useState(() => readOpen(storageKey, !context.remembered_for));
    const toggleOpen = () => {
        setOpen((current) => {
            writeOpen(storageKey, !current);
            return !current;
        });
    };

    // Specific tags offers the tags this activity has been tagged with (and any already chosen).
    const chosenTagIds = choice.mode === 'tags' ? choice.tagIds : (instance.tags || []).map((tag) => tag.id);
    const activityCatalog = {
        families: catalog.families,
        tags: catalog.tags.filter((tag) => (
            tag.activities?.some((activity) => activity.id === activityId) || chosenTagIds.includes(tag.id)
        )),
    };
    const groups = groupTagsForPicker(activityCatalog, { keepIds: chosenTagIds });
    const families = familiesWithMembers(activityCatalog);

    const save = async (changes) => {
        const next = { ...choice, ...changes };
        const tagsById = new Map(catalog.tags.map((tag) => [tag.id, tag]));
        try {
            await setComparison({
                instanceId: instance.id,
                ...next,
                tags: next.mode === 'tags' ? next.tagIds.map((id) => tagsById.get(id)).filter(Boolean) : [],
                version: context.version,
            });
        } catch (error) {
            notify.error(`Failed to change comparison: ${formatError(error)}`);
        }
    };

    const total = timeline?.total ?? 0;
    const totalAll = timeline?.total_all ?? 0;
    const narrowed = choice.mode !== 'all' || choice.sameTemplate || choice.sameProgramDay;
    const scopes = [
        ['sameTemplate', 'Same template', context.template],
        ['sameProgramDay', 'Same program day', context.program_day],
    ];
    // The header names the scope in one short line; collapsed, it shows the compared tags too.
    // The toggle row names the scope ("Same day | Same template"); collapsed, the compared tags
    // follow below a divider.
    const scopeSummary = [choice.sameProgramDay && 'Same day', choice.sameTemplate && 'Same template']
        .filter(Boolean).join(' | ') || 'Any session';
    const summaryTags = choice.mode === 'tags' ? context.tags || [] : choice.mode === 'same_tags' ? instance.tags || [] : [];
    const summary = choice.mode === 'all' ? 'All history' : summaryTags.length ? (
        <ActivityTagBadges tags={summaryTags} ariaLabel="Compared tags" />
    ) : 'Untagged sessions';
    const bodyId = `compare-with-body-${instance.id}`;
    const scopeFieldset = (
        <fieldset className={styles.scopeToggles} disabled={isPending}>
            <legend>Within</legend>
            {scopes.map(([key, label, scope]) => (
                <label
                    key={key}
                    className={styles.scopeToggle}
                    title={scope ? undefined : `This session has no ${key === 'sameTemplate' ? 'session template' : 'program day'}`}
                >
                    <input
                        type="checkbox"
                        checked={choice[key]}
                        disabled={!scope}
                        onChange={(event) => void save({ [key]: event.target.checked })}
                    />
                    <span>{label}</span>
                    {scope ? <span className={styles.scopeName}>{scope.name}</span> : null}
                </label>
            ))}
        </fieldset>
    );
    return (
        <section className={styles.compareSection} aria-labelledby="compare-with-label">
        <h3 id="compare-with-label" className={styles.compareSectionLabel}>Compare with</h3>
        <div className={styles.compareControls} aria-label="Progress comparison">
            <button
                type="button"
                className={styles.compareHeader}
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={toggleOpen}
            >
                <strong className={styles.compareTitle}>{scopeSummary}</strong>
                <span className={styles.compareHeaderEnd}>
                    {timeline ? (
                        <span className={styles.cohortCount} title={`${narrowed ? `${total} of ${totalAll}` : totalAll} past sessions match`}>
                            {narrowed ? `${total} of ${totalAll}` : `${totalAll} past`}
                        </span>
                    ) : null}
                    <ChevronIcon size={14} direction={open ? 'up' : 'down'} />
                </span>
            </button>
            {!open ? (
                <>
                    <hr className={styles.compareDivider} />
                    <div className={styles.compareSummary}>{summary}</div>
                </>
            ) : null}
            {open ? (
            <div id={bodyId} className={styles.compareBody}>
            {scopeFieldset}
            <fieldset className={styles.compareModes} aria-labelledby="compare-with-label" disabled={isPending}>
                {MODES.map(([mode, label]) => (
                    <label key={mode} className={`${styles.compareMode} ${choice.mode === mode ? styles.compareModeSelected : ''}`}>
                        <input
                            type="radio"
                            name={`compare-mode-${instance.id}`}
                            checked={choice.mode === mode}
                            onChange={() => void save({ mode, tagIds: mode === 'tags' ? chosenTagIds : [] })}
                        />
                        {label}
                    </label>
                ))}
            </fieldset>
            <div className={styles.compareDetail}>
                {choice.mode === 'same_tags' ? (
                    (instance.tags || []).length
                        ? <><span>Past sessions tagged</span><ActivityTagBadges tags={instance.tags} /></>
                        : <span>Past sessions with no tags on this activity</span>
                ) : null}
                {choice.mode === 'tags' ? (
                    groups.length ? (
                        <div className={styles.tagChips} aria-label="Tags to compare with">
                            {groups.map((group) => (
                                <div key={group.key} className={styles.tagChipGroup} role="group" aria-label={group.label}>
                                    {groups.length > 1 || group.family ? (
                                        <span className={styles.tagChipGroupLabel}>{group.label}{group.singleSelect ? ' · single select' : ''}</span>
                                    ) : null}
                                    {group.tags.map((tag) => {
                                        const selected = choice.tagIds.includes(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                className={`${styles.tagChip} ${selected ? styles.tagChipSelected : ''}`}
                                                style={tag.color ? { '--tag-color': tag.color } : undefined}
                                                aria-pressed={selected}
                                                disabled={isPending}
                                                onClick={() => void save({ tagIds: toggleTagSelection(choice.tagIds, tag, families) })}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ) : <span>No tags have been used on this activity yet.</span>
                ) : null}
                {choice.mode === 'all' ? <span>Every past session, whatever its tags</span> : null}
            </div>
            </div>
            ) : null}
        </div>
        </section>
    );
}
