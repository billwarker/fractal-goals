import { getProgramDaySpecificDates, getProgramDayWeekdays } from '../../utils/programViewModel';
import { SCHEDULE_MODES } from './ProgramDayScheduleField';

function parseLegacyWeekdays(dayOfWeek) {
    if (typeof dayOfWeek !== 'string' || !dayOfWeek.trim().startsWith('[')) return dayOfWeek;
    try {
        return JSON.parse(dayOfWeek);
    } catch {
        return dayOfWeek;
    }
}

export function buildInitialProgramDayState(initialData) {
    const selectedTemplates = initialData?.templates
        ? initialData.templates.map((template, index) => ({
            templateId: template.id,
            isRequired: template.is_required !== false,
            order: template.order ?? index,
        }))
        : (initialData?.sessions || []).map((session, index) => ({
            templateId: session.session_template_id,
            isRequired: true,
            order: index,
        })).filter((entry) => Boolean(entry.templateId));

    const selectedDaysOfWeek = getProgramDayWeekdays({
        day_of_week: parseLegacyWeekdays(initialData?.day_of_week),
    });
    const specificDates = getProgramDaySpecificDates(initialData);

    return {
        name: initialData?.name || '',
        selectedTemplates,
        selectedDaysOfWeek,
        repeatEveryWeeks: initialData?.repeat_every_weeks || 1,
        specificDates,
        // A day with dates and no weekdays (including a new day opened from a
        // calendar date) edits as a specific-dates day.
        scheduleMode: specificDates.length && !selectedDaysOfWeek.length
            ? SCHEDULE_MODES.dates
            : SCHEDULE_MODES.weekly,
        completionMinTemplates: initialData?.completion_min_templates || '',
        goalIds: initialData?.goal_ids || [],
    };
}
