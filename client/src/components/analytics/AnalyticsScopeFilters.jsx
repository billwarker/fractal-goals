import React, { useMemo, useState } from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityTagCatalog';
import OptionSelectionModal from '../common/OptionSelectionModal';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import TagChipPicker from '../common/TagChipPicker';
import AnalyticsFilterHeader from './AnalyticsFilterHeader';
import { selectionSummary, tagSelectionSummary } from './analyticsFilterSummaries';

/** Session templates as options: {id, name, color, count} in name order (count: sessions). */
function templateOptions(sessions) {
    const byId = new Map();
    (sessions || []).forEach((session) => {
        const id = session?.template_id;
        if (!id) return;
        const option = byId.get(id) || { id, name: session.template_name || 'Untitled', color: session.template_color || null, count: 0 };
        option.count += 1;
        byId.set(id, option);
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Program days as options grouped by program (in program-name order), each day with its count. */
function programDayOptions(sessions) {
    const byId = new Map();
    (sessions || []).forEach((session) => {
        const id = session?.program_day_id;
        if (!id) return;
        const option = byId.get(id) || {
            id,
            name: session.program_day_name || 'Untitled',
            count: 0,
            group: session.program_id
                ? { id: session.program_id, name: session.program_name || 'Program', color: session.program_color || null }
                : null,
        };
        option.count += 1;
        byId.set(id, option);
    });
    return [...byId.values()].sort((a, b) => (
        (a.group?.name || '\uffff').localeCompare(b.group?.name || '\uffff') || a.name.localeCompare(b.name)
    ));
}

const optionTitle = (option) => (option.group ? `${option.group.name} · ${option.name}` : option.name);

const SESSION_SCOPES = [
    { key: 'templateIds', filterId: 'templates', label: 'Session template', plural: 'Templates', any: 'Any template' },
    { key: 'programDayIds', filterId: 'programDays', label: 'Program day', plural: 'Program Days', any: 'Any program day' },
];

/**
 * Global scope by tags, session template and program day. The pane decides which show (`visible`,
 * from the charts' filter capabilities); a template or program-day filter also hides while no
 * session has one, unless it's set. Tags use the same chips as the Progress pane's Compare with, and
 * match either every chosen tag or exactly the chosen set (how the Progress pane compares; none
 * chosen then means untagged sessions).
 */
export default function AnalyticsScopeFilters({
    rootId, filters, sessions = [], onUpdate, onClearFilter, notAppliedTo = () => null, visible = { tags: true, templates: true, programDays: true },
}) {
    const { data: catalog } = useActivityTagCatalog(rootId);
    const templates = useMemo(() => templateOptions(sessions), [sessions]);
    const programDays = useMemo(() => programDayOptions(sessions), [sessions]);
    const tagIds = filters.tags?.tagIds || [];
    const [pickingKey, setPickingKey] = useState(null);
    const optionsByKey = { templateIds: templates, programDayIds: programDays };

    const setTags = (next) => onUpdate((current) => ({ ...current, tags: next }));
    const setSessions = (key, ids) => onUpdate((current) => ({ ...current, sessions: { ...current.sessions, [key]: ids } }));
    const showTags = visible.tags || Boolean(filters.tags);
    const sessionSections = SESSION_SCOPES
        .filter(({ key, filterId }) => filters.sessions[key].length > 0 || (visible[filterId] && optionsByKey[key].length > 0));
    const picking = SESSION_SCOPES.find((scope) => scope.key === pickingKey) || null;

    return (
        <>
            {showTags ? (
                <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" aria-label="Tag filter" data-filter-section="tags">
                    <AnalyticsFilterHeader title="Tags" summary={tagSelectionSummary(filters.tags, catalog.tags || [])}
                        active={Boolean(filters.tags)} onClear={() => onClearFilter('tags')} ignoredBy={notAppliedTo('tags')} />
                    <TagChipPicker
                        catalog={catalog}
                        selectedIds={tagIds}
                        onChange={(next) => setTags({ tagIds: next, match: filters.tags?.match || 'all' })}
                        ariaLabel="Tags to filter by"
                    />
                    <label className="sessions-query-checkbox-row sessions-query-checkbox-row-compact sessions-query-field-spaced">
                        <input
                            type="checkbox"
                            checked={filters.tags?.match === 'exact'}
                            onChange={(event) => setTags({ tagIds, match: event.target.checked ? 'exact' : 'all' })}
                        />
                        Exact tag set
                    </label>
                </section>
            ) : null}
            {sessionSections.map(({ key, filterId, label, plural, any }) => {
                const selected = filters.sessions[key];
                return (
                    <section key={key} className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" aria-label={`${label} filter`} data-filter-section={filterId}>
                        <AnalyticsFilterHeader title={label}
                            summary={selectionSummary(selected, optionsByKey[key].map((option) => ({ ...option, name: optionTitle(option) })), any, `Unavailable ${label.toLowerCase()}`)}
                            active={selected.length > 0} onClear={() => onClearFilter(filterId)} ignoredBy={notAppliedTo(filterId)} />
                        <button
                            type="button"
                            className="sessions-query-picker-button"
                            onClick={() => setPickingKey(key)}
                            disabled={optionsByKey[key].length === 0}
                        >
                            {selected.length ? `Choose ${plural} (${selected.length})` : `Choose ${plural}`}
                        </button>
                    </section>
                );
            })}
            {picking ? (
                <OptionSelectionModal
                    isOpen
                    title={`Filter by ${picking.label.toLowerCase()}`}
                    options={optionsByKey[picking.key]}
                    selectedIds={filters.sessions[picking.key]}
                    searchPlaceholder={`Search ${picking.plural.toLowerCase()}…`}
                    onApply={(ids) => setSessions(picking.key, ids)}
                    renderLabel={picking.key === 'templateIds'
                        ? (option) => <SessionTemplateNameBadge name={option.name} color={option.color} size="sm" />
                        : undefined}
                    onClose={() => setPickingKey(null)}
                />
            ) : null}
        </>
    );
}
