// @ts-check
/**
 * Soft guidance for goal due dates, mirroring services/goal_deadline_rules.py: a date that breaks
 * a rule is still saved, and these warnings explain why it may be off. Both implementations are
 * checked against tests/fixtures/goal_deadline_cases.json.
 */

const DAY_UNITS = { days: 1, weeks: 7 };
const MONTH_UNITS = { months: 1, years: 12, decades: 120 };

/** @param {unknown} value @returns {string | null} an ISO date (YYYY-MM-DD) */
export function toIsoDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** @param {string} iso */
const parts = (iso) => iso.split('-').map(Number);
/** @param {number} year @param {number} month 1-based */
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** @param {number} year @param {number} month @param {number} day */
const formatIso = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * `anchor` moved by a level interval; units under a day stay on the anchor's date.
 * @param {string} anchor ISO date
 * @param {number | null | undefined} amount
 * @param {string | null | undefined} unit
 * @returns {string | null}
 */
export function addInterval(anchor, amount, unit) {
    if (amount == null || !unit) return null;
    const [year, month, day] = parts(anchor);
    if (unit in DAY_UNITS) {
        const moved = new Date(Date.UTC(year, month - 1, day + amount * DAY_UNITS[/** @type {keyof typeof DAY_UNITS} */ (unit)]));
        return moved.toISOString().slice(0, 10);
    }
    if (unit in MONTH_UNITS) {
        const monthIndex = month - 1 + amount * MONTH_UNITS[/** @type {keyof typeof MONTH_UNITS} */ (unit)];
        const nextYear = year + Math.floor(monthIndex / 12);
        const nextMonth = ((monthIndex % 12) + 12) % 12 + 1;
        return formatIso(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
    }
    if (unit === 'minutes' || unit === 'hours') return anchor;
    return null;
}

/**
 * @typedef {{
 *   parent_deadline?: unknown, child_deadlines?: unknown[], started_at?: unknown,
 *   horizon_min?: [number | null, string | null] | null, horizon_max?: [number | null, string | null] | null,
 *   program_start?: unknown, program_end?: unknown,
 * }} DeadlineContext
 */

/**
 * Warnings for a proposed due date, in the server's order; empty when it fits every rule.
 * @param {unknown} deadlineValue
 * @param {DeadlineContext} context
 * @returns {Array<Record<string, any>>}
 */
export function deadlineWarnings(deadlineValue, context = {}) {
    const deadline = toIsoDate(deadlineValue);
    if (!deadline) return [];
    const warnings = [];
    const programStart = toIsoDate(context.program_start);
    const programEnd = toIsoDate(context.program_end);
    if (programStart && programEnd && !(programStart <= deadline && deadline <= programEnd)) {
        warnings.push({ code: 'outside_program', program_start: programStart, program_end: programEnd });
    }
    const startedAt = toIsoDate(context.started_at);
    if (startedAt) {
        const [minAmount, minUnit] = context.horizon_min || [null, null];
        const [maxAmount, maxUnit] = context.horizon_max || [null, null];
        const earliest = addInterval(startedAt, minAmount, minUnit);
        const latest = addInterval(startedAt, maxAmount, maxUnit);
        if (earliest && deadline < earliest) warnings.push({ code: 'before_horizon', earliest });
        if (latest && deadline > latest) warnings.push({ code: 'after_horizon', latest });
    }
    const parentDeadline = toIsoDate(context.parent_deadline);
    if (parentDeadline && deadline > parentDeadline) {
        warnings.push({ code: 'after_parent', parent_deadline: parentDeadline });
    }
    const laterChildren = (context.child_deadlines || [])
        .map(toIsoDate)
        .filter((child) => child && child > deadline)
        .sort();
    if (laterChildren.length > 0) {
        warnings.push({ code: 'children_after', count: laterChildren.length, latest: laterChildren[laterChildren.length - 1] });
    }
    return warnings;
}

/**
 * The rule context for a goal, from its parent, children, level and (optionally) a program.
 * @param {any} goal
 * @param {{ parent?: any, children?: any[], level?: any, program?: any }} [related]
 * @returns {DeadlineContext}
 */
export function deadlineContextForGoal(goal, { parent = null, children = [], level = null, program = null } = {}) {
    const read = (/** @type {any} */ node, /** @type {string} */ key) => node?.[key] ?? node?.attributes?.[key] ?? null;
    return {
        parent_deadline: read(parent, 'deadline'),
        child_deadlines: (children || []).filter((child) => !read(child, 'deleted_at')).map((child) => read(child, 'deadline')),
        started_at: read(goal, 'started_at') || read(goal, 'created_at'),
        horizon_min: level ? [level.deadline_min_value ?? null, level.deadline_min_unit ?? null] : null,
        horizon_max: level ? [level.deadline_max_value ?? null, level.deadline_max_unit ?? null] : null,
        program_start: program?.start_date ?? null,
        program_end: program?.end_date ?? null,
    };
}

/**
 * @param {Record<string, any>} warning
 * @param {(iso: string) => string} [formatDate]
 */
export function describeDeadlineWarning(warning, formatDate = (iso) => iso) {
    switch (warning.code) {
        case 'outside_program':
            return `Outside the program (${formatDate(warning.program_start)} – ${formatDate(warning.program_end)})`;
        case 'before_horizon':
            return `Sooner than this level usually allows (from ${formatDate(warning.earliest)})`;
        case 'after_horizon':
            return `Later than this level usually allows (by ${formatDate(warning.latest)})`;
        case 'after_parent':
            return `After the parent goal’s due date (${formatDate(warning.parent_deadline)})`;
        case 'children_after':
            return `${warning.count} child ${warning.count === 1 ? 'goal is' : 'goals are'} due later (latest ${formatDate(warning.latest)})`;
        default:
            return '';
    }
}
