import {
    DEFAULT_TEMPLATE_COLOR,
    SESSION_TYPE_NORMAL,
    getSessionRuntimeType,
    getTemplateColor,
} from '../../utils/sessionRuntime';


const EMPTY_TEMPLATE = {
    name: '', description: '', sessionType: SESSION_TYPE_NORMAL,
    templateColor: DEFAULT_TEMPLATE_COLOR, sections: [], quickActivities: [],
};

export function createSectionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `section-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildActivityPreview(activity) {
    if (activity.item_type === 'circuit' || activity.circuit_definition_id) {
        return {
            item_type: 'circuit',
            circuit_definition_id: activity.circuit_definition_id,
            name: activity.name,
            type: activity.type || 'Circuit',
        };
    }
    return { item_type: 'activity', activity_id: activity.id, name: activity.name, type: activity.type };
}

export function buildTemplateActivityCatalogue(activities = [], circuits = []) {
    return [
        ...activities,
        ...circuits.map((circuit) => ({
            ...circuit,
            id: `circuit:${circuit.id}`,
            circuit_definition_id: circuit.id,
            item_type: 'circuit',
            type: 'Circuit',
        })),
    ];
}

export function canUseTemplateItemInQuickSession(item) {
    return item.item_type !== 'circuit';
}

export function getTemplateItemKey(item, index) {
    return `${item.activity_id || item.circuit_definition_id || item.name}-${index}`;
}

export function serializeTemplateItem(item) {
    if (item.item_type === 'circuit') {
        return { type: 'circuit', circuit_definition_id: item.circuit_definition_id };
    }
    return {
        type: 'activity',
        activity_definition_id: item.activity_id,
        name: item.name,
    };
}

function normalizeTemplateItem(item, activities) {
    if (item?.type === 'circuit' || item?.circuit_definition_id) {
        const circuit = activities.find((candidate) => (
            candidate.circuit_definition_id === item.circuit_definition_id
        ));
        return {
            ...buildActivityPreview(circuit || {
                item_type: 'circuit',
                circuit_definition_id: item.circuit_definition_id,
                name: item.name || 'Archived circuit',
                type: 'Circuit',
            }),
            ...item,
            item_type: 'circuit',
        };
    }
    const activityId = item?.activity_definition_id || item?.activity_id || item?.id;
    const activity = activities.find((candidate) => candidate.id === activityId);
    return { ...(activity ? buildActivityPreview(activity) : {}), ...item, item_type: 'activity', activity_id: activityId };
}

export function buildActivityGroupOptions(activityGroups) {
    const groupMap = new Map((activityGroups || []).map((group) => [group.id, group]));
    const buildPath = (group) => {
        const names = [];
        const visited = new Set();
        let current = group;
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            names.unshift(current.name);
            current = current.parent_id ? groupMap.get(current.parent_id) : null;
        }
        return names.join(' / ');
    };
    return (activityGroups || [])
        .map((group) => ({ id: group.id, label: buildPath(group) }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildInitialTemplate(editingTemplate, activities = []) {
    if (!editingTemplate) return { ...EMPTY_TEMPLATE, sections: [], quickActivities: [] };
    const sections = (editingTemplate.template_data?.sections || []).map((section) => ({
        ...section,
        id: section.id || section.template_section_id || createSectionId(),
        activities: (section.items || section.activities || section.exercises || []).map((item) => (
            normalizeTemplateItem(item, activities)
        )),
    }));
    return {
        name: editingTemplate.name || '',
        description: editingTemplate.description || '',
        sessionType: getSessionRuntimeType(editingTemplate),
        templateColor: getTemplateColor(editingTemplate),
        sections,
        quickActivities: (editingTemplate.template_data?.activities || []).map((activity) => ({ ...activity })),
    };
}
