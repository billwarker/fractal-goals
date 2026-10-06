// Pure edits for a dated session plan's sections in the Programs Days tab.
// Sections are fixed by the template; only their items change.

function newItemKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `plan-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapSectionItems(sections, sectionIndex, mapItems) {
    return sections.map((section, index) => (
        index === sectionIndex ? { ...section, items: mapItems(section.items || []) } : section
    ));
}

/** Items added in a plan stay in the plan when template changes are pulled. */
export function addPlanItem(sections, sectionIndex, selection) {
    const item = selection.circuit_definition_id
        ? {
            type: 'circuit',
            circuit_definition_id: selection.circuit_definition_id,
            name: selection.name,
        }
        : {
            type: 'activity',
            activity_definition_id: selection.id,
            name: selection.name,
        };
    return mapSectionItems(sections, sectionIndex, (items) => [
        ...items,
        { ...item, item_key: newItemKey(), added_in_plan: true },
    ]);
}

export function removePlanItem(sections, sectionIndex, itemIndex) {
    return mapSectionItems(sections, sectionIndex, (items) => items.filter((_, index) => index !== itemIndex));
}

export function movePlanItem(sections, sectionIndex, itemIndex, direction) {
    return mapSectionItems(sections, sectionIndex, (items) => {
        const target = itemIndex + direction;
        if (target < 0 || target >= items.length) return items;
        const next = [...items];
        [next[itemIndex], next[target]] = [next[target], next[itemIndex]];
        return next;
    });
}

export function setPlanItemPrescription(sections, sectionIndex, itemIndex, prescription) {
    return mapSectionItems(sections, sectionIndex, (items) => items.map((item, index) => {
        if (index !== itemIndex) return item;
        const next = { ...item };
        if (prescription) next.prescription = prescription;
        else delete next.prescription;
        return next;
    }));
}

/** item_key -> prescription for the plan a draft was seeded from (placeholder values). */
export function indexPrescriptionsByItemKey(sections) {
    const index = new Map();
    (sections || []).forEach((section) => (section.items || []).forEach((item) => {
        if (item.item_key && item.prescription) index.set(item.item_key, item.prescription);
    }));
    return index;
}

/** A saved plan is "Planned"; an unsaved date is the template (earlier plans are only hints). */
export function describePlanSource(entry) {
    return entry.source === 'plan' ? 'Planned' : 'Template default';
}
