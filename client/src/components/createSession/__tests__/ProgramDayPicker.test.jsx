import React from 'react';
import { render, screen } from '@testing-library/react';

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
});
