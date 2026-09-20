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
    const daysByProgram = new Map();
    days.forEach((day) => {
        const key = String(day.program_id || 'unspecified-program');
        daysByProgram.set(key, [...(daysByProgram.get(key) || []), day]);
    });
    const programStates = [...daysByProgram.values()].map((programDaysForDate) => {
        const manualStatus = programDaysForDate[0].manual_status;
        if (manualStatus === 'complete' || manualStatus === 'rest') return manualStatus;
        const rules = programDaysForDate.flatMap((day) => getProgramDayTemplateRules({
            templates: (day.sessions || []).map((session) => ({ ...session, id: session.template_id })),
        }));
        const requiredIds = new Set(rules.filter((rule) => rule.isRequired).map((rule) => String(rule.templateKey)));
        const completedIds = new Set(programDaysForDate.flatMap((day) => day.completed_template_ids || []).map(String));
        const minimum = Math.max(...programDaysForDate.map((day) => Number(day.completion_min_templates || 0)));
        const requiredComplete = [...requiredIds].every((id) => completedIds.has(id));
        const evidenceComplete = rules.length > 0 && requiredComplete
            && (minimum ? completedIds.size >= minimum : requiredIds.size > 0 || completedIds.size > 0);
        return evidenceComplete ? 'complete' : 'pending';
    });
    const isDayComplete = programStates.length > 0 && programStates.every((state) => state === 'complete');
    const isDayRest = programStates.length > 0 && programStates.every((state) => state === 'rest');

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
        isDayRest,
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
