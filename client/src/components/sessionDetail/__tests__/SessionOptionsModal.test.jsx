import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SessionOptionsModal from '../SessionOptionsModal';

// Rendered without app providers: the modal needs none, and AuthProvider's on-mount
// user fetch could otherwise log after the file's worker has torn down.
describe('SessionOptionsModal', () => {
    it('prefills the template name and submits it', async () => {
        const onCreateTemplate = vi.fn().mockResolvedValue({});

        render(
            <SessionOptionsModal
                isOpen
                onClose={vi.fn()}
                sessionName="Morning Workout"
                onCreateTemplate={onCreateTemplate}
                onDuplicateSession={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save as Template' }));

        const input = screen.getByLabelText('Template Name');
        expect(input).toHaveValue('Morning Workout');

        fireEvent.change(input, { target: { value: ' Morning Template ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Template' }));

        await waitFor(() => {
            expect(onCreateTemplate).toHaveBeenCalledWith('Morning Template');
        });
    });

    it('runs the duplicate action', () => {
        const onDuplicateSession = vi.fn();

        render(
            <SessionOptionsModal
                isOpen
                onClose={vi.fn()}
                sessionName="Morning Workout"
                onCreateTemplate={vi.fn()}
                onDuplicateSession={onDuplicateSession}
                isCompleted
                canDuplicateSession
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Duplicate Session' }));
        expect(onDuplicateSession).toHaveBeenCalledTimes(1);
    });

    it.each([
        { isCompleted: false, isPaused: false, canDuplicateSession: false },
        { isCompleted: false, isPaused: true, canDuplicateSession: false },
        { isCompleted: true, isPaused: false, canDuplicateSession: false },
    ])('hides duplication when unavailable: %j', (state) => {
        render(
            <SessionOptionsModal isOpen onClose={vi.fn()} {...state} />
        );
        expect(screen.queryByText('Duplicate Session')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save as Template' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Delete Session' })).toBeEnabled();
    });

    it('runs pause/resume and delete actions from options', () => {
        const onPauseResume = vi.fn();
        const onDelete = vi.fn();

        render(
            <SessionOptionsModal
                isOpen
                onClose={vi.fn()}
                sessionName="Morning Workout"
                onCreateTemplate={vi.fn()}
                onDuplicateSession={vi.fn()}
                onPauseResume={onPauseResume}
                onDelete={onDelete}
                isPaused={false}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Pause Session' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete Session' }));

        expect(onPauseResume).toHaveBeenCalledTimes(1);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});
