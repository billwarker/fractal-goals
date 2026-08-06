import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import QuickSessionModal from '../QuickSessionModal';

vi.mock('../../sessionDetail', () => ({
    QuickSessionWorkspace: ({ showCompletionAction }) => (
        <div data-testid="quick-session-workspace">
            completion action: {String(showCompletionAction)}
        </div>
    ),
}));

describe('QuickSessionModal', () => {
    it('presents the quick-session workspace and submits it from the modal', () => {
        const onComplete = vi.fn();
        render(
            <QuickSessionModal
                isOpen
                templateName="Weigh Myself"
                onClose={vi.fn()}
                onComplete={onComplete}
            />
        );

        expect(screen.getByRole('dialog', { name: 'Quick Session · Weigh Myself' })).toBeInTheDocument();
        expect(screen.getByTestId('quick-session-workspace')).toHaveTextContent('completion action: false');
        fireEvent.click(screen.getByRole('button', { name: 'Complete Quick Session' }));
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('cancels unless a submission is in progress', () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <QuickSessionModal
                isOpen
                templateName="Morning Check-in"
                onClose={onClose}
                onComplete={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        rerender(
            <QuickSessionModal
                isOpen
                templateName="Morning Check-in"
                onClose={onClose}
                onComplete={vi.fn()}
                isSubmitting
            />
        );

        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
});
