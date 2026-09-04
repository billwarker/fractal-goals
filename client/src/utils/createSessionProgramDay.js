import { getTemplateSortTimestamp } from './durationStats';
import { getProgramDayTemplateRules } from './programViewModel';

const sortTemplates = (templates) => [...templates].sort((left, right) => (
    getTemplateSortTimestamp(right).localeCompare(getTemplateSortTimestamp(left))
));

export function programSessionToTemplate(session) {
    return {
        id: session.template_id,
        name: session.template_name,
        description: session.template_description,
        template_data: session.template_data,
        template_color: session.template_color || session.template_data?.template_color,
    };
}

export function buildTodayProgramDayView(programDays = []) {
    const days = (programDays || []).filter(Boolean);
    const allTemplateIds = new Set();
    const requiredTemplateIds = new Set();
    const completedTemplateIds = new Set();
    let completedCount = 0;
    let minTemplates = 0;

    days.forEach((day) => {
        const rules = getProgramDayTemplateRules({
            templates: (day.sessions || []).map((session) => ({
                ...session,
                id: session.template_id,
            })),
        });
        rules.forEach((rule) => {
            const templateId = String(rule.templateKey);
            allTemplateIds.add(templateId);
            if (rule.isRequired) requiredTemplateIds.add(templateId);
        });
        (day.completed_template_ids || []).forEach((id) => completedTemplateIds.add(String(id)));
        completedCount += Number(day.completed_session_count || 0);
        minTemplates = Math.max(minTemplates, Number(day.completion_min_templates || 0));
    });

    const totalRequired = requiredTemplateIds.size;
    const effectiveMinimum = minTemplates || totalRequired;
    const requiredComplete = [...requiredTemplateIds].every((id) => completedTemplateIds.has(id));
    const isDayComplete = days.length > 0 && (
        days.every((day) => Boolean(day.is_completed))
        || (requiredComplete && completedTemplateIds.size >= effectiveMinimum)
    );

    return {
        hasProgramDayToday: days.length > 0,
        days,
        requiredTemplateIds,
        allTemplateIds,
        completedTemplateIds,
        totalRequired,
        completedCount,
        minTemplates: effectiveMinimum,
        isDayComplete,
    };
}

export function partitionTemplatesByProgram(templates = [], programTemplateIds = new Set()) {
    const idSet = programTemplateIds instanceof Set
        ? programTemplateIds
        : new Set(programTemplateIds || []);
    const programTemplates = [];
    const otherTemplates = [];
    sortTemplates(templates).forEach((template) => {
        (idSet.has(String(template.id)) ? programTemplates : otherTemplates).push(template);
    });
    return { programTemplates, otherTemplates };
}
