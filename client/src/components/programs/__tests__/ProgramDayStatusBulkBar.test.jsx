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
});
