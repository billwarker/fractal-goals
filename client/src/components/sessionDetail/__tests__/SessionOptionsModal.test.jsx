import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import SessionOptionsModal from '../SessionOptionsModal';

describe('SessionOptionsModal', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            configurable: true,
        });
    });

    it('prefills the template name and submits it', async () => {
        const onCreateTemplate = vi.fn().mockResolvedValue({});

        renderWithProviders(
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

        renderWithProviders(
            <SessionOptionsModal
                isOpen
                onClose={vi.fn()}
                sessionName="Morning Workout"
                onCreateTemplate={vi.fn()}
                onDuplicateSession={onDuplicateSession}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Duplicate Session' }));
        expect(onDuplicateSession).toHaveBeenCalledTimes(1);
    });
});
