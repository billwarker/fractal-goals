/**
 * Pure state transitions and validation for the template builder. Each update
 * takes the current template and returns the next one (or the same object when
 * nothing changes), so they compose directly with `setCurrentTemplate`.
 */
import { SESSION_TYPE_NORMAL, SESSION_TYPE_QUICK } from '../../utils/sessionRuntime';
import { serializeTemplateItem } from './templateBuilderItems';

export const MAX_QUICK_ACTIVITIES = 5;

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

export const removeQuickActivity = (template, index) => ({
    ...template,
    quickActivities: withoutIndex(template.quickActivities, index),
});

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

export function moveQuickActivity(template, index, direction) {
    const quickActivities = moveListItem(template.quickActivities, index, direction);
    return quickActivities ? { ...template, quickActivities } : template;
}

/** The section draft's error message, or null with its parsed duration. */
export function validateSectionDraft(draft) {
    if (!draft.name.trim()) return { error: 'Section name is required' };
    const duration = parseInt(draft.duration_minutes, 10) || 10;
    if (duration < 1) return { error: 'Duration must be at least 1 minute' };
    return { error: null, duration };
}

/** The first problem that blocks saving, or null. */
export function validateTemplate(template, { isQuick }) {
    if (!template.name.trim()) return 'Template name is required';
    if (isQuick) {
        if (template.quickActivities.length === 0) return 'Quick sessions must include at least one activity.';
        if (template.quickActivities.length > MAX_QUICK_ACTIVITIES) {
            return `Quick sessions are limited to ${MAX_QUICK_ACTIVITIES} activities.`;
        }
        return null;
    }
    return template.sections.length === 0 ? 'Add at least one section to the template.' : null;
}

/** The `template_data` payload saved for a quick or normal template. */
export function buildTemplateData(template, { isQuick, totalDuration }) {
    if (isQuick) {
        return {
            session_type: SESSION_TYPE_QUICK,
            template_color: template.templateColor,
            activities: template.quickActivities,
        };
    }
    return {
        session_type: SESSION_TYPE_NORMAL,
        template_color: template.templateColor,
        sections: template.sections.map(({ activities: sectionItems = [], ...sectionFields }) => ({
            ...sectionFields,
            items: sectionItems.map(serializeTemplateItem),
        })),
        total_duration_minutes: totalDuration,
    };
}
