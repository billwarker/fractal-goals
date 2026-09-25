import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ProgramDayStatusMark from '../ProgramDayStatusMark';
import ProgramDayStatusMenu from '../ProgramDayStatusMenu';

function renderMenu(props = {}) {
    render(
        <ProgramDayStatusMenu
            name="Front Lever Focus"
            date="2026-09-20"
            today="2026-09-25"
            state="scheduled_pending"
            manualStatus={null}
            occurrenceCount={1}
            pending={false}
            onSetStatus={vi.fn().mockResolvedValue(true)}
            {...props}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Change status for Front Lever Focus/ }));
}

describe('ProgramDayStatusMark', () => {
    it('draws a moon for rest', () => {
        render(<ProgramDayStatusMark status="rest" label="Rest day" />);
        const mark = screen.getByRole('img', { name: 'Rest day' });
        expect(mark).toHaveAttribute('data-program-day-status', 'rest');
        expect(mark.querySelector('svg')).not.toBeNull();
    });
});

describe('ProgramDayStatusMenu', () => {
    it('shows the status symbol beside each option', () => {
        renderMenu({ manualStatus: 'complete' });
        const symbolFor = (name) => screen.getByRole('button', { name })
            .querySelector('[data-program-day-status]')?.getAttribute('data-program-day-status');

        expect(symbolFor('Mark complete')).toBe('complete');
        expect(symbolFor('Mark rest')).toBe('rest');
        expect(symbolFor('Use automatic status')).toBe('scheduled');
    });

    it('marks the current manual status and shows the moon on the trigger for rest', () => {
        renderMenu({ state: 'rest', manualStatus: 'rest' });

        expect(screen.getByRole('button', { name: 'Mark rest' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveAttribute('aria-pressed', 'false');
        const trigger = screen.getByRole('button', { name: /Change status for Front Lever Focus/ });
        expect(trigger.querySelector('[data-program-day-status]')).toHaveAttribute('data-program-day-status', 'rest');
    });
});
