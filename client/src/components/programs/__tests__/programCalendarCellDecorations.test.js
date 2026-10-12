import { describe, expect, it } from 'vitest';

import {
    buildBackgroundRanges,
    clearCellDecoration,
    decorateCalendarCell,
    indexCalendarLabelsByDate,
    normalizeCalendarEventDate,
    pickCellBackgrounds,
} from '../programCalendarCellDecorations';

const classNames = {
    blockCellLabel: 'blockLabel',
    weekCellLabel: 'weekLabel',
    programCellLabel: 'programLabel',
    blockCellLabelWithWeek: 'withWeek',
    blockCellLabelName: 'labelName',
    weekChip: 'weekChip',
    dayStatusAssistive: 'assistive',
    streak: { label: 'streakLength', line: 'streakLine', assistive: 'assistive' },
};

function makeCell(date) {
    const cell = document.createElement('td');
    cell.className = 'fc-daygrid-day';
    cell.setAttribute('data-date', date);
    const frame = document.createElement('div');
    frame.className = 'fc-daygrid-day-frame';
    cell.appendChild(frame);
    return cell;
}

const context = (overrides = {}) => ({
    labelsByDate: new Map(),
    backgroundRanges: [],
    dayStatesByDate: new Map(),
    programDayRibbonDates: new Set(),
    loadingMonths: null,
    selectedProgramName: 'Base',
    multiSelect: false,
    moveMode: false,
    selectableDateSet: new Set(),
    selectedDate: null,
    selectedStatusDateSet: new Set(),
    dragPreviewDates: new Set(),
    ...overrides,
});

describe('normalizeCalendarEventDate', () => {
    it('keeps the date part of strings and formats local Date objects', () => {
        expect(normalizeCalendarEventDate('2026-10-12T09:00:00Z')).toBe('2026-10-12');
        expect(normalizeCalendarEventDate(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(normalizeCalendarEventDate(null)).toBe('');
    });
});

describe('background ranges', () => {
    const events = [
        { display: 'background', start: '2026-10-01', end: '2026-10-11', backgroundColor: 'red', extendedProps: { type: 'program_background' } },
        { display: 'background', start: '2026-10-05', end: '2026-10-08', borderColor: 'blue', extendedProps: { type: 'block_background' } },
        { display: 'background', start: '2026-10-01', end: '2026-10-11', extendedProps: { type: 'other' } },
        { start: '2026-10-01', extendedProps: { type: 'program_day' } },
    ];

    it('keeps only program and block backgrounds', () => {
        const ranges = buildBackgroundRanges(events);
        expect(ranges.map((range) => range.type)).toEqual(['program_background', 'block_background']);
        expect(ranges[1].color).toBe('blue');
    });

    it('treats range ends as exclusive', () => {
        const ranges = buildBackgroundRanges(events);
        expect(pickCellBackgrounds(ranges, '2026-10-07').block?.color).toBe('blue');
        expect(pickCellBackgrounds(ranges, '2026-10-08').block).toBeNull();
        expect(pickCellBackgrounds(ranges, '2026-10-10').program?.color).toBe('red');
        expect(pickCellBackgrounds(ranges, '2026-10-11')).toEqual({ program: null, block: null });
    });

    it('prefers the higher sort order when ranges of one kind overlap', () => {
        const ranges = [
            { start: '2026-10-01', end: '2026-10-03', color: 'low', sortOrder: -20, type: 'program_background' },
            { start: '2026-10-01', end: '2026-10-03', color: 'high', sortOrder: -5, type: 'program_background' },
        ];
        expect(pickCellBackgrounds(ranges, '2026-10-02').program.color).toBe('high');
    });
});

describe('indexCalendarLabelsByDate', () => {
    it('groups labels by date in list order and skips undated labels', () => {
        const labels = indexCalendarLabelsByDate([
            [{ date: '2026-10-01', title: 'Program', labelType: 'program' }],
            [{ date: '2026-10-01', title: 'Block A' }, { title: 'No date' }],
        ]);
        expect(labels.get('2026-10-01').map((label) => [label.title, label.labelType])).toEqual([
            ['Program', 'program'],
            ['Block A', 'block'],
        ]);
        expect(labels.size).toBe(1);
    });
});

describe('decorateCalendarCell', () => {
    it('adds labels and selection affordances, and clearing removes everything it added', () => {
        const cell = makeCell('2026-10-05');
        decorateCalendarCell(cell, context({
            labelsByDate: indexCalendarLabelsByDate([[{ date: '2026-10-05', title: 'Block A', blockId: 'b1' }]]),
            backgroundRanges: [{ start: '2026-10-01', end: '2026-10-10', color: 'green', sortOrder: -10, type: 'block_background' }],
            multiSelect: true,
            selectableDateSet: new Set(['2026-10-05']),
            selectedStatusDateSet: new Set(['2026-10-05']),
        }), classNames);

        expect(cell.getAttribute('data-calendar-background')).toBe('block');
        expect(cell.getAttribute('aria-selected')).toBe('true');
        expect(cell.getAttribute('tabindex')).toBe('0');
        const label = cell.querySelector('[data-program-block-label="true"]');
        expect(label.getAttribute('aria-label')).toBe('Select Block A');

        clearCellDecoration(cell, classNames);
        expect(cell.querySelector('[data-program-block-label]')).toBeNull();
        expect(cell.hasAttribute('aria-selected')).toBe(false);
        expect(cell.hasAttribute('data-calendar-background')).toBe(false);
        expect(cell.style.getPropertyValue('--program-calendar-cell-color')).toBe('');
    });

    it('is idempotent: re-decorating never duplicates labels', () => {
        const cell = makeCell('2026-10-05');
        const ctx = context({ labelsByDate: indexCalendarLabelsByDate([[{ date: '2026-10-05', title: 'Block A' }]]) });
        decorateCalendarCell(cell, ctx, classNames);
        decorateCalendarCell(cell, ctx, classNames);
        expect(cell.querySelectorAll('[data-program-block-label]')).toHaveLength(1);
    });

    it('leaves non-selectable dates out of multi-day keyboard navigation', () => {
        const cell = makeCell('2026-10-06');
        decorateCalendarCell(cell, context({ multiSelect: true, selectableDateSet: new Set(['2026-10-05']) }), classNames);
        expect(cell.hasAttribute('tabindex')).toBe(false);
    });

    it('marks loading months', () => {
        const cell = makeCell('2026-11-02');
        decorateCalendarCell(cell, context({ loadingMonths: new Set(['2026-11']) }), classNames);
        expect(cell.getAttribute('data-loading')).toBe('true');
        decorateCalendarCell(cell, context({ loadingMonths: new Set() }), classNames);
        expect(cell.hasAttribute('data-loading')).toBe(false);
    });
});
