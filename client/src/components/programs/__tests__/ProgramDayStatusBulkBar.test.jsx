import React from 'react';
import { render, screen } from '@testing-library/react';

import ProgramDayStatusBulkBar from '../ProgramDayStatusBulkBar';

describe('ProgramDayStatusBulkBar', () => {
    it('explains why Complete is unavailable for a future selection', () => {
        render(<ProgramDayStatusBulkBar
            dates={['2026-09-16', '2026-09-17']}
            today="2026-09-16"
            onApply={vi.fn()}
            onCancel={vi.fn()}
        />);

        const complete = screen.getByRole('button', { name: 'Complete' });
        expect(complete).toBeDisabled();
        expect(complete).toHaveAccessibleDescription(/Future days cannot be marked complete/);
        expect(screen.getByRole('button', { name: 'Rest' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Automatic' })).toBeEnabled();
    });

    it('applies statuses only to scheduled dates while an event spans the whole selection', () => {
        const onPlanTimeOff = vi.fn();
        render(<ProgramDayStatusBulkBar
            dates={['2026-09-12', '2026-09-13']}
            scheduledDates={[]}
            today="2026-09-10"
            onApply={vi.fn()}
            onPlanTimeOff={onPlanTimeOff}
            onCancel={vi.fn()}
        />);

        expect(screen.getByText('2 selected · 0 scheduled')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rest' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Automatic' })).toBeDisabled();
        screen.getByRole('button', { name: 'Plan event…' }).click();
        expect(onPlanTimeOff).toHaveBeenCalledTimes(1);
    });
});
