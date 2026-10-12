import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import ProgramCalendarView from '../../components/programs/ProgramCalendarView';

/** Render ProgramCalendarView with one Block 1 label on 2026-05-17 and spy handlers. */
export function renderCalendar(overrides = {}) {
    const props = {
        calendarEvents: [],
        blockLabels: [{
            title: 'Block 1',
            date: '2026-05-17',
            startDate: '2026-05-17',
            endDate: '2026-05-23',
            programId: 'program-1',
            blockId: 'block-1',
            color: '#dceaff',
        }],
        programLabels: [],
        blockCreationMode: false,
        setBlockCreationMode: vi.fn(),
        onAddBlockClick: vi.fn(),
        onDateSelect: vi.fn(),
        onDateClick: vi.fn(),
        onEventClick: vi.fn(),
        onBlockLabelClick: vi.fn(),
        onTodayClick: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<ProgramCalendarView {...props} />),
    };
}
