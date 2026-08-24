import { fireEvent, render, screen } from '@testing-library/react';

import ProgramDayTodayBanner from '../ProgramDayTodayBanner';

describe('ProgramDayTodayBanner', () => {
    it('shows context and progress and jumps to the day', () => {
        const onJump = vi.fn();
        render(<ProgramDayTodayBanner
            programName="Strength Base"
            programColor="#22c55e"
            blockName="Upper Push"
            blockColor="#d946ef"
            dayName="Push"
            dayNumber={4}
            completedCount={1}
            minTemplates={2}
            onJumpToProgramDay={onJump}
        />);
        expect(screen.getByText('Today is Day 4 — Push')).toBeInTheDocument();
        expect(screen.getByText('Strength Base')).toHaveStyle({ color: '#22c55e' });
        expect(screen.getByText('Upper Push')).toHaveStyle({ color: '#d946ef' });
        expect(screen.getByText('1 / 2 complete')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start this day' }));
        expect(onJump).toHaveBeenCalledTimes(1);
    });

    it('uses a quiet completed state without an action', () => {
        render(<ProgramDayTodayBanner programName="Strength" blockName="Base" isDayComplete completedCount={2} minTemplates={2} />);
        expect(screen.getByText('Today’s program day is complete')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start this day' })).not.toBeInTheDocument();
    });
});
