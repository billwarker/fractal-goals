import { getLocalISOString } from './dateUtils';
import { isQuickSession } from './sessionRuntime';

export function extractActivityId(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const direct = item.activity_id || item.activity_definition_id || item.activityId
        || item.activityDefinitionId || item.definition_id || item.id;
    if (direct) return direct;
    if (item.activity && typeof item.activity === 'object') {
        return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
    }
    return null;
}

function normalizeSection(section) {
    const templateItems = section.items || section.activities || section.exercises || [];
    const items = templateItems.map((item) => {
        if (item?.type === 'circuit' && item.circuit_definition_id) {
            return { type: 'circuit', circuit_definition_id: item.circuit_definition_id };
        }
        const activityId = extractActivityId(item);
        if (!activityId) return null;
        return {
            type: 'activity',
            name: (typeof item === 'object' ? item.name : null) || 'Activity',
            activity_definition_id: activityId,
        };
    }).filter(Boolean);
    const sectionFields = { ...section };
    delete sectionFields.activities;
    delete sectionFields.exercises;
    return {
        ...sectionFields,
        items,
        estimated_duration_minutes: section.estimated_duration_minutes || section.duration_minutes,
    };
}

export function buildTemplateSessionPayload(template, selectedProgramDay, goalIds = []) {
    const quickTemplate = isQuickSession(template);
    const shared = {
        template_id: template.id,
        template_name: template.name,
        template_color: template.template_color || template.template_data?.template_color,
    };
    const sessionDataPayload = quickTemplate
        ? { ...shared, session_type: 'quick', program_context: null }
        : {
            ...shared,
            session_type: 'normal',
            program_context: selectedProgramDay ? {
                program_id: selectedProgramDay.program_id,
                program_name: selectedProgramDay.program_name,
                program_color: selectedProgramDay.program_color,
                block_id: selectedProgramDay.block_id,
                block_name: selectedProgramDay.block_name,
                block_color: selectedProgramDay.block_color,
                day_id: selectedProgramDay.day_id,
                day_name: selectedProgramDay.day_name,
                day_number: selectedProgramDay.day_number,
                day_date: selectedProgramDay.day_date,
            } : null,
            sections: (template.template_data?.sections || []).map(normalizeSection),
            total_duration_minutes: template.template_data?.total_duration_minutes || 0,
        };
    return {
        name: template.name,
        description: template.description || '',
        template_id: template.id,
        duration_minutes: quickTemplate ? 0 : (template.template_data?.total_duration_minutes || 0),
        session_start: getLocalISOString(),
        session_data: sessionDataPayload,
        ...(quickTemplate ? {} : { goal_ids: goalIds }),
    };
}
