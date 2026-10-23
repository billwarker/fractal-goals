// Groups catalog tags the way every tag picker shows them: families in order, then "Other tags".

const byOrder = (left, right) => (
    (left.sort_order ?? 0) - (right.sort_order ?? 0)
    || String(left.name).localeCompare(String(right.name))
    || String(left.id).localeCompare(String(right.id))
);

export const OTHER_TAGS_KEY = 'other';

/**
 * @param {{families?: Array, tags?: Array}} catalog
 * @param {{includeArchived?: boolean, keepIds?: Iterable<string>, search?: string}} options
 *   Archived tags are hidden unless included or listed in keepIds (already assigned).
 * @returns {Array<{key: string, family: object|null, label: string, singleSelect: boolean, tags: Array}>}
 */
export function groupTagsForPicker(catalog, { includeArchived = false, keepIds = [], search = '' } = {}) {
    const keep = new Set(keepIds);
    const needle = search.trim().toLocaleLowerCase();
    const visible = (catalog?.tags || []).filter((tag) => (
        (includeArchived || !tag.archived || keep.has(tag.id))
        && (!needle || tag.name.toLocaleLowerCase().includes(needle))
    ));
    const families = [...(catalog?.families || [])].sort(byOrder);
    const familyIds = new Set(families.map((family) => family.id));
    const groups = families.map((family) => ({
        key: family.id,
        family,
        label: family.name,
        singleSelect: Boolean(family.single_select),
        tags: visible.filter((tag) => tag.family_id === family.id).sort(byOrder),
    }));
    groups.push({
        key: OTHER_TAGS_KEY,
        family: null,
        label: families.length ? 'Other tags' : 'Tags',
        singleSelect: false,
        tags: visible.filter((tag) => !familyIds.has(tag.family_id)).sort(byOrder),
    });
    return groups.filter((group) => group.tags.length);
}

/** Toggle a tag in a selection, replacing its sibling when the tag's family is single select. */
export function toggleTagSelection(selectedIds, tag, families = []) {
    const selected = [...(selectedIds || [])];
    if (selected.includes(tag.id)) return selected.filter((id) => id !== tag.id);
    const family = families.find((candidate) => candidate.id === tag.family_id);
    if (family?.single_select) {
        return [...selected.filter((id) => !family.tagIds?.has?.(id)), tag.id];
    }
    return [...selected, tag.id];
}

/** Families with a Set of their member tag ids, for toggleTagSelection. */
export function familiesWithMembers(catalog) {
    const members = new Map();
    (catalog?.tags || []).forEach((tag) => {
        if (!tag.family_id) return;
        if (!members.has(tag.family_id)) members.set(tag.family_id, new Set());
        members.get(tag.family_id).add(tag.id);
    });
    return (catalog?.families || []).map((family) => ({ ...family, tagIds: members.get(family.id) || new Set() }));
}
