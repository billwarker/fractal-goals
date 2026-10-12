/**
 * Imperative decoration of FullCalendar day cells for the program calendar:
 * background colours, day-state attributes, streak lines, block/week labels,
 * and multi-day selection affordances. FullCalendar owns the cells, so these
 * helpers add and remove only the nodes and attributes they own.
 */
import { applyStreakDecoration, clearStreakDecoration } from '../../utils/programCalendarStreaks';
import { getProgramDayStateMeta } from '../../utils/programDayState';

const CELL_ATTRIBUTES = [
    'data-calendar-background',
    'data-day-state',
    'aria-selected',
    'aria-label',
    'tabindex',
    'data-program-selectable-date',
];

export function formatCalendarCellDate(date) {
    if (!(date instanceof Date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function normalizeCalendarEventDate(date) {
    if (typeof date === 'string') return date.slice(0, 10);
    return formatCalendarCellDate(date);
}

/** Program and block labels grouped by the date cell they render in. */
export function indexCalendarLabelsByDate(labelLists) {
    const labels = new Map();
    labelLists.flat().forEach((label) => {
        if (!label?.date) return;
        const dateLabels = labels.get(label.date) || [];
        dateLabels.push({
            title: label.title,
            date: label.date,
            color: label.color || 'var(--color-text-primary)',
            startDate: label.startDate || label.date,
            endDate: label.endDate || label.date,
            programId: label.programId,
            blockId: label.blockId,
            labelType: label.labelType || 'block',
            weekChip: label.weekChip || null,
            weekTitle: label.weekTitle || null,
        });
        labels.set(label.date, dateLabels);
    });
    return labels;
}

/** Program and block background spans, as half-open `[start, end)` date ranges. */
export function buildBackgroundRanges(calendarEvents) {
    return (calendarEvents || [])
        .filter((event) => event?.display === 'background')
        .map((event) => {
            const eventType = event.extendedProps?.type;
            if (eventType !== 'program_background' && eventType !== 'block_background') return null;
            const start = normalizeCalendarEventDate(event.start);
            const end = normalizeCalendarEventDate(event.end);
            if (!start || !end) return null;
            return {
                start,
                end,
                color: event.backgroundColor || event.borderColor || 'var(--color-brand-primary)',
                sortOrder: event.extendedProps?.sortOrder ?? (eventType === 'block_background' ? -10 : -20),
                type: eventType,
            };
        })
        .filter(Boolean);
}

/** The highest-sorted program and block background covering `dateStr`. */
export function pickCellBackgrounds(backgroundRanges, dateStr) {
    const selected = { program: null, block: null };
    backgroundRanges.forEach((range) => {
        if (dateStr < range.start || dateStr >= range.end) return;
        const key = range.type === 'block_background' ? 'block' : 'program';
        if (!selected[key] || range.sortOrder >= selected[key].sortOrder) selected[key] = range;
    });
    return selected;
}

/** Remove every attribute, label, and assistive node this module adds to a cell. */
export function clearCellDecoration(dayEl, classNames) {
    const frame = dayEl.querySelector('.fc-daygrid-day-frame');
    dayEl.style.removeProperty('--program-calendar-cell-color');
    CELL_ATTRIBUTES.forEach((attribute) => dayEl.removeAttribute(attribute));
    dayEl.removeAttribute('data-loading');
    frame?.querySelectorAll(`[data-program-block-label], .${classNames.blockCellLabel}`)
        .forEach((label) => label.remove());
    frame?.querySelectorAll('[data-program-cell-assistive]').forEach((status) => status.remove());
    clearStreakDecoration(dayEl, frame);
    if (frame) {
        frame.removeAttribute('data-block-label');
        frame.style.removeProperty('--program-block-label-color');
    }
    return frame;
}

function createWeekLabel(blockLabel, index, classNames) {
    // Decorative: the week also shows in the day pane, so screen readers get the
    // full sentence once and the visible chip stays hidden from them.
    const weekLabel = document.createElement('span');
    weekLabel.className = `${classNames.blockCellLabel} ${classNames.weekCellLabel}`;
    weekLabel.title = blockLabel.weekTitle;
    weekLabel.setAttribute('data-program-block-label', 'week');
    weekLabel.style.setProperty('--program-block-label-color', blockLabel.color);
    weekLabel.style.setProperty('--program-label-offset', `${index * 16}px`);
    const chip = document.createElement('span');
    chip.className = classNames.weekChip;
    chip.textContent = blockLabel.title;
    chip.setAttribute('aria-hidden', 'true');
    const assistive = document.createElement('span');
    assistive.className = classNames.dayStatusAssistive;
    assistive.textContent = blockLabel.weekTitle;
    weekLabel.append(chip, assistive);
    return weekLabel;
}

function createLabelButton(blockLabel, index, dateStr, classNames) {
    const labelButton = document.createElement('button');
    labelButton.type = 'button';
    labelButton.className = classNames.blockCellLabel;
    if (blockLabel.labelType === 'program') labelButton.classList.add(classNames.programCellLabel);
    labelButton.textContent = blockLabel.title;
    labelButton.title = blockLabel.weekTitle || blockLabel.title;
    if (blockLabel.weekChip) {
        labelButton.classList.add(classNames.blockCellLabelWithWeek);
        const chip = document.createElement('span');
        chip.className = classNames.weekChip;
        chip.textContent = blockLabel.weekChip;
        chip.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = classNames.blockCellLabelName;
        name.textContent = blockLabel.title;
        labelButton.replaceChildren(chip, name);
    }
    labelButton.setAttribute('aria-label', blockLabel.labelType === 'program'
        ? `View ${blockLabel.title}`
        : `Select ${blockLabel.title}`);
    labelButton.setAttribute('data-program-block-label', 'true');
    labelButton.setAttribute('data-program-block-label-date', dateStr);
    labelButton.setAttribute('data-program-block-label-index', String(index));
    labelButton.style.setProperty('--program-block-label-color', blockLabel.color);
    labelButton.style.setProperty('--program-label-offset', `${index * 16}px`);
    return labelButton;
}

/**
 * Re-decorate one day cell from scratch.
 *
 * `context` carries the per-render lookups: labels, backgrounds, day states,
 * ribbon dates, loading months, and the selection mode/state for this cell.
 */
export function decorateCalendarCell(dayEl, context, classNames) {
    const dateStr = dayEl.getAttribute('data-date');
    if (!dateStr || !dayEl.querySelector('.fc-daygrid-day-frame')) return;
    const frame = clearCellDecoration(dayEl, classNames);
    if (context.loadingMonths?.has(dateStr.slice(0, 7))) dayEl.setAttribute('data-loading', 'true');

    const backgrounds = pickCellBackgrounds(context.backgroundRanges, dateStr);
    const background = backgrounds.block || backgrounds.program;
    if (background) {
        dayEl.style.setProperty('--program-calendar-cell-color', background.color);
        dayEl.setAttribute('data-calendar-background', backgrounds.block ? 'block' : 'program');
    }

    const dayState = context.dayStatesByDate.get(dateStr);
    const stateMeta = getProgramDayStateMeta(dayState?.state);
    if (dayState && stateMeta) {
        dayEl.setAttribute('data-day-state', dayState.state);
        if (!context.programDayRibbonDates.has(dateStr)) {
            const status = document.createElement('span');
            status.className = classNames.dayStatusAssistive;
            status.textContent = `${context.selectedProgramName || 'Selected program'}: ${stateMeta.label}`;
            // Only nodes this decorator injected carry this attribute; React-owned
            // ribbon content (e.g. ProgramDayStatusMark) must never be removed here.
            status.setAttribute('data-program-cell-assistive', 'true');
            frame.appendChild(status);
        }
    }

    applyStreakDecoration(dayEl, frame, dayState, classNames.streak);

    const { multiSelect, moveMode } = context;
    if ((multiSelect || moveMode) && context.selectableDateSet.has(dateStr)) {
        const selected = moveMode
            ? context.selectedDate === dateStr
            : context.selectedStatusDateSet.has(dateStr) || context.dragPreviewDates.has(dateStr);
        const state = selected ? 'selected' : 'not selected';
        dayEl.setAttribute('aria-selected', selected ? 'true' : 'false');
        dayEl.setAttribute('aria-label', moveMode
            ? `Move destination ${dateStr}, ${state}`
            : `${dateStr}, ${dayState?.scheduled ? 'scheduled program day' : 'program date'}, ${state}`);
        dayEl.setAttribute('tabindex', '0');
        dayEl.setAttribute('data-program-selectable-date', dateStr);
    }

    (context.labelsByDate.get(dateStr) || []).forEach((blockLabel, index) => {
        frame.appendChild(blockLabel.labelType === 'week'
            ? createWeekLabel(blockLabel, index, classNames)
            : createLabelButton(blockLabel, index, dateStr, classNames));
    });
}
