import { formatBucketLabel } from '../../utils/chartFormat';

/** Full selection names, including a readable fallback for archived or unavailable choices. */
export function selectionSummary(ids, options, emptyLabel, unavailableLabel = 'Unavailable selection') {
    if (!ids.length) return emptyLabel;
    const names = new Map(options.map((option) => [option.id, option.name]));
    return `${ids.length} selected: ${ids.map((id) => names.get(id) || unavailableLabel).join(', ')}`;
}

export function dateRangeSummary(range) {
    const day = (value) => formatBucketLabel(value, 'day');
    if (range?.start && range?.end) return `${day(range.start)} – ${day(range.end)}`;
    if (range?.start) return `Since ${day(range.start)}`;
    if (range?.end) return `Until ${day(range.end)}`;
    return 'All time';
}

export function tagSelectionSummary(tags, options) {
    if (!tags) return 'All tags';
    if (tags.match === 'exact' && !tags.tagIds.length) return 'Untagged · Exact tag set';
    return `${selectionSummary(tags.tagIds, options, 'All tags', 'Unavailable tag')} · ${tags.match === 'exact' ? 'Exact tag set' : 'Contains every selected tag'}`;
}
