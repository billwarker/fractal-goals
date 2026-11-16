/**
 * Pure state transitions and validation for the template builder. Each update
 * takes the current template and returns the next one (or the same object when
 * nothing changes), so they compose directly with `setCurrentTemplate`.
 */
import { serializeTemplateItem } from './templateBuilderItems';

/** Swap `list[index]` with its neighbour; null when the move would leave the list. */
export function moveListItem(list, index, direction) {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return null;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

const withoutIndex = (list, index) => list.filter((_, currentIndex) => currentIndex !== index);

function updateSection(template, sectionIndex, update) {
    const section = template.sections[sectionIndex];
    if (!section) return template;
    const nextSection = update(section);
    if (nextSection === section) return template;
    const sections = [...template.sections];
    sections[sectionIndex] = nextSection;
    return { ...template, sections };
}

export const removeSection = (template, index) => ({ ...template, sections: withoutIndex(template.sections, index) });

export const removeSectionItem = (template, sectionIndex, itemIndex) => updateSection(
    template,
    sectionIndex,
    (section) => ({ ...section, activities: withoutIndex(section.activities || [], itemIndex) }),
);

export function moveSection(template, index, direction) {
    const sections = moveListItem(template.sections, index, direction);
    return sections ? { ...template, sections } : template;
}

export const moveSectionItem = (template, sectionIndex, itemIndex, direction) => updateSection(
    template,
    sectionIndex,
    (section) => {
        const activities = moveListItem(section.activities || [], itemIndex, direction);
        return activities ? { ...section, activities } : section;
    },
);

/** The section draft's error message, or null with its parsed duration. */
export function validateSectionDraft(draft) {
    if (!draft.name.trim()) return { error: 'Section name is required' };
    const duration = parseInt(draft.duration_minutes, 10) || 10;
    if (duration < 1) return { error: 'Duration must be at least 1 minute' };
    return { error: null, duration };
}

/** The first problem that blocks saving, or null. */
export function validateTemplate(template) {
    if (!template.name.trim()) return 'Template name is required';
    return template.sections.length === 0 ? 'Add at least one section to the template.' : null;
}

/** The `template_data` payload saved for a template. */
export function buildTemplateData(template, { totalDuration }) {
    return {
        template_color: template.templateColor,
        sections: template.sections.map(({ activities: sectionItems = [], ...sectionFields }) => ({
            ...sectionFields,
            items: sectionItems.map(serializeTemplateItem),
        })),
        total_duration_minutes: totalDuration,
    };
}
