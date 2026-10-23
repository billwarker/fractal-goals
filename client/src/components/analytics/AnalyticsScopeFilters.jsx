import React, { useMemo } from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityTagCatalog';
import { groupTagsForPicker } from '../../utils/tagPickerOptions';

/** Distinct {id, name} options for a session field pair, in name order. */
function sessionOptions(sessions, idKey, nameKey) {
    const byId = new Map();
    (sessions || []).forEach((session) => {
        if (session?.[idKey] && !byId.has(session[idKey])) byId.set(session[idKey], session[nameKey] || 'Untitled');
    });
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

const toggle = (ids, id) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);

/**
 * Global scope by tags, session template and program day. Tags match either every chosen tag,
 * or exactly the chosen set (how the Progress pane compares; none chosen then means untagged).
 */
export default function AnalyticsScopeFilters({ rootId, filters, sessions = [], onUpdate }) {
    const { data: catalog } = useActivityTagCatalog(rootId);
    const tagGroups = useMemo(() => groupTagsForPicker(catalog, { keepIds: filters.tags?.tagIds || [] }), [catalog, filters.tags]);
    const templates = useMemo(() => sessionOptions(sessions, 'template_id', 'template_name'), [sessions]);
    const programDays = useMemo(() => sessionOptions(sessions, 'program_day_id', 'program_day_name'), [sessions]);
    const tagIds = filters.tags?.tagIds || [];

    const setTags = (next) => onUpdate((current) => ({ ...current, tags: next }));
    const setSessions = (key, ids) => onUpdate((current) => ({ ...current, sessions: { ...current.sessions, [key]: ids } }));

    return (
        <>
            <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" aria-label="Tag filter">
                <div className="sessions-query-sidebar-section-header">
                    <h4>Tags</h4>
                    <span>{filters.tags ? (tagIds.length ? `${tagIds.length} selected` : 'Untagged') : 'Any'}</span>
                </div>
                {tagGroups.length ? tagGroups.map((group) => (
                    <div key={group.key} className="sessions-query-chip-group" role="group" aria-label={group.label}>
                        {tagGroups.length > 1 ? <span className="sessions-query-selection-preview">{group.label}</span> : null}
                        {group.tags.map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                className={`sessions-query-chip ${tagIds.includes(tag.id) ? 'active' : ''}`}
                                aria-pressed={tagIds.includes(tag.id)}
                                onClick={() => setTags({ tagIds: toggle(tagIds, tag.id), match: filters.tags?.match || 'all' })}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                )) : <div className="sessions-query-selection-preview">No tags yet</div>}
                <div className="sessions-query-inline-actions">
                    <label className="sessions-query-checkbox-row sessions-query-checkbox-row-compact">
                        <input
                            type="checkbox"
                            checked={filters.tags?.match === 'exact'}
                            onChange={(event) => setTags({ tagIds, match: event.target.checked ? 'exact' : 'all' })}
                        />
                        Exact tag set
                    </label>
                    {filters.tags ? <button type="button" className="sessions-query-chip" onClick={() => setTags(null)}>Any tags</button> : null}
                </div>
            </section>
            {[['Session template', 'templateIds', templates], ['Program day', 'programDayIds', programDays]].map(([label, key, options]) => (
                <section key={key} className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" aria-label={`${label} filter`}>
                    <div className="sessions-query-sidebar-section-header">
                        <h4>{label}</h4>
                        <span>{filters.sessions[key].length ? `${filters.sessions[key].length} selected` : 'Any'}</span>
                    </div>
                    {options.length ? (
                        <div className="sessions-query-chip-group" role="group" aria-label={label}>
                            {options.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={`sessions-query-chip ${filters.sessions[key].includes(option.id) ? 'active' : ''}`}
                                    aria-pressed={filters.sessions[key].includes(option.id)}
                                    onClick={() => setSessions(key, toggle(filters.sessions[key], option.id))}
                                >
                                    {option.name}
                                </button>
                            ))}
                        </div>
                    ) : <div className="sessions-query-selection-preview">None in this history</div>}
                </section>
            ))}
        </>
    );
}
