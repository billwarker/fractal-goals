/**
 * Copies a program's blocks and days into a newly created program, shifted to its
 * start date. Program-day goals carry over when they are still among the new program's
 * goals (utils/programFocus.js).
 */
import { fractalApi } from './api';

function datePart(value) {
    return value ? String(value).split('T')[0] : null;
}

export function getDayOffset(startDate, nextStartDate) {
    const source = new Date(`${datePart(startDate)}T00:00:00`);
    const target = new Date(`${datePart(nextStartDate)}T00:00:00`);
    if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) return 0;
    return Math.round((target.getTime() - source.getTime()) / 86400000);
}

export function shiftDatePart(dateValue, dayOffset) {
    const value = datePart(dateValue);
    if (!value) return null;
    const shifted = new Date(`${value}T00:00:00`);
    if (Number.isNaN(shifted.getTime())) return null;
    shifted.setDate(shifted.getDate() + dayOffset);
    return shifted.toISOString().slice(0, 10);
}

function dayTemplateConfigs(day) {
    return (day.templates || []).map((template, index) => ({
        template_id: template.id,
        is_required: template.is_required !== false,
        order: template.order ?? index,
    })).filter((config) => Boolean(config.template_id));
}

export async function duplicateProgramStructure({ rootId, programId, source, startDate, programGoalIds = [] }) {
    const dayOffset = getDayOffset(source.start_date, startDate);
    for (const sourceBlock of source.blocks || []) {
        await fractalApi.createBlock(rootId, programId, {
            name: sourceBlock.name,
            start_date: shiftDatePart(sourceBlock.start_date, dayOffset),
            end_date: shiftDatePart(sourceBlock.end_date, dayOffset),
            color: sourceBlock.color,
            track_weeks: Boolean(sourceBlock.track_weeks),
            week_start_day: sourceBlock.week_start_day ?? null,
        });
    }
    // Program days belong to the program; their specific dates shift with it.
    for (const sourceDay of source.days || []) {
        const templateConfigs = dayTemplateConfigs(sourceDay);
        await fractalApi.createProgramDay(rootId, programId, {
            name: sourceDay.name,
            day_of_week: sourceDay.day_of_week || [],
            scheduled_dates: (sourceDay.scheduled_dates || [])
                .map((value) => shiftDatePart(value, dayOffset))
                .filter(Boolean),
            excluded_dates: (sourceDay.excluded_dates || []).map((value) => shiftDatePart(value, dayOffset)).filter(Boolean),
            template_ids: templateConfigs.map((config) => config.template_id),
            template_configs: templateConfigs,
            completion_min_templates: sourceDay.completion_min_templates || null,
            goal_ids: (sourceDay.goal_ids || []).filter((goalId) => programGoalIds.includes(goalId)),
        });
    }
}
