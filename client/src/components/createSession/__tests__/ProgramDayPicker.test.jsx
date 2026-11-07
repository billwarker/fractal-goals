import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ProgramDayPicker from '../ProgramDayPicker';

describe('ProgramDayPicker', () => {
    it('uses configured block and template colors for program-day choices', () => {
        const programDay = {
            program_name: 'Q4 2026',
            program_color: '#22c55e',
            block_id: 'block-1',
            block_name: 'Month 1',
            block_color: '#d946ef',
            day_id: 'day-1',
            day_name: 'Sunday Practice',
            day_number: 1,
            sessions: [
                {
                    template_id: 'template-1',
                    template_name: 'Applied Practice',
                    template_color: '#f97316',
                },
                {
                    template_id: 'template-2',
                    template_name: 'Pickup Music',
                    template_data: { template_color: '#22c55e' },
                },
            ],
        };

        render(<ProgramDayPicker
            programDays={[programDay]}
            selectedProgramDay={programDay}
            selectedProgramSession={programDay.sessions[0]}
            hasTemplates
            onSelectProgramDay={vi.fn()}
            onSelectProgramSession={vi.fn()}
            onSwitchToTemplate={vi.fn()}
        />);

        screen.getAllByText('Month 1').forEach((blockName) => {
            expect(blockName).toHaveStyle({ color: '#d946ef' });
        });
        expect(screen.getByText('Q4 2026')).toHaveStyle({ color: '#22c55e' });
        expect(screen.getByText('Applied Practice')).toHaveStyle({ color: '#f97316' });
        expect(screen.getByText('Pickup Music')).toHaveStyle({ color: '#22c55e' });
    });

    describe('previous days', () => {
        const session = { template_id: 't1', template_name: 'Legs A' };
        const row = (date, overrides = {}) => ({
            day_id: 'legs', day_name: 'Legs', day_number: 1, program_name: 'Q4', is_previous: true, last_date: date,
            last_status_label: 'Not done', sessions: [session], ...overrides,
        });
        const props = { programDays: [], onSelectProgramDay: vi.fn(), onSelectProgramSession: vi.fn() };

        it('offers them with nothing scheduled today', () => {
            const onSelectProgramDay = vi.fn();
            const previous = row('2026-11-07');
            render(<ProgramDayPicker {...props} previousDays={[previous]} onSelectProgramDay={onSelectProgramDay} />);
            expect(screen.getByText('Select a Previous Program Day')).toBeInTheDocument();
            expect(screen.getByText(/Last: .*Nov 7 · Not done/)).toBeInTheDocument();
            fireEvent.click(screen.getByText('Legs'));
            expect(onSelectProgramDay).toHaveBeenCalledWith(previous);
        });

        it('selects one day type, not all of them', () => {
            const selected = row('2026-11-07');
            render(<ProgramDayPicker {...props} previousDays={[selected, row('2026-11-06', { day_id: 'push', day_name: 'Push' })]} selectedProgramDay={selected} />);
            expect(screen.getAllByText('✓')).toHaveLength(1);
        });

        it('disables a day whose template is gone', () => {
            const onSelectProgramDay = vi.fn();
            render(<ProgramDayPicker {...props} previousDays={[row('2026-11-07', { sessions: [] })]} onSelectProgramDay={onSelectProgramDay} />);
            expect(screen.getByText(/Template no longer available/)).toBeInTheDocument();
            fireEvent.click(screen.getByText('Legs'));
            expect(onSelectProgramDay).not.toHaveBeenCalled();
        });
    });
});
