import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ProgramDaysNavigator from '../ProgramDaysNavigator';

const blocks = [
    { id: 'b1', name: 'Month 1', color: '#3366ff', days: [
        { id: 'd1', name: 'Planche Focus - Day 1', templates: [{ id: 't1', name: 'Planche Focus' }] },
        { id: 'd2', name: 'Front Lever Focus - Day 2', templates: [
            { id: 't2', name: 'Front Lever' }, { id: 't3', name: 'Mobility' },
        ] },
        { id: 'd3', name: 'Rest', templates: [] },
    ] },
    { id: 'b2', name: 'Deload', days: [] },
];

describe('ProgramDaysNavigator', () => {
    it('lists plannable days by block with their templates and marks the selection', () => {
        render(<ProgramDaysNavigator blocks={blocks} selectedDayId="d2" onSelectDay={vi.fn()} onSelectTemplate={vi.fn()} />);

        expect(screen.getByRole('heading', { name: 'Month 1' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Deload' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Rest' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Front Lever Focus - Day 2' })).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('list', { name: 'Front Lever Focus - Day 2 templates' }).children).toHaveLength(2);
    });

    it('selects a day, or a day and template to bring its plan into view', () => {
        const onSelectDay = vi.fn();
        const onSelectTemplate = vi.fn();
        render(<ProgramDaysNavigator blocks={blocks} selectedDayId="d1" onSelectDay={onSelectDay} onSelectTemplate={onSelectTemplate} />);

        fireEvent.click(screen.getByRole('button', { name: 'Front Lever Focus - Day 2' }));
        fireEvent.click(screen.getByRole('button', { name: 'Plan Mobility for Front Lever Focus - Day 2' }));

        expect(onSelectDay).toHaveBeenCalledWith('d2');
        expect(onSelectTemplate).toHaveBeenCalledWith('d2', 't3');
    });

    it('explains how to get started when nothing can be planned', () => {
        render(<ProgramDaysNavigator blocks={[{ id: 'b', name: 'B', days: [] }]} selectedDayId={null} onSelectDay={vi.fn()} onSelectTemplate={vi.fn()} />);

        expect(screen.getByText(/Add a program day with a session template/)).toBeInTheDocument();
    });

    it('scopes a day from a click anywhere in its container without overriding its templates', () => {
        const onSelectDay = vi.fn();
        const onSelectTemplate = vi.fn();
        render(
            <ProgramDaysNavigator
                blocks={blocks}
                selectedDayId="d1"
                onSelectDay={onSelectDay}
                onSelectTemplate={onSelectTemplate}
            />,
        );

        fireEvent.click(screen.getByRole('list', { name: 'Front Lever Focus - Day 2 templates' }));
        expect(onSelectDay).toHaveBeenCalledWith('d2');

        onSelectDay.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Plan Mobility for Front Lever Focus - Day 2' }));
        expect(onSelectTemplate).toHaveBeenCalledWith('d2', 't3');
        expect(onSelectDay).not.toHaveBeenCalled();
    });
});
