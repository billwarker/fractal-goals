import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityModesModal from '../ActivityModesModal';

const { notify } = vi.hoisted(() => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const useActivityModes = vi.fn();
const useCreateActivityMode = vi.fn();
const useUpdateActivityMode = vi.fn();
const useDeleteActivityMode = vi.fn();

vi.mock('../../../hooks/useActivityQueries', () => ({
    useActivityModes: (...args) => useActivityModes(...args),
    useCreateActivityMode: (...args) => useCreateActivityMode(...args),
    useUpdateActivityMode: (...args) => useUpdateActivityMode(...args),
    useDeleteActivityMode: (...args) => useDeleteActivityMode(...args),
}));

vi.mock('../../../utils/mutationNotify', () => ({
    formatError: (error) => error.message,
}));

vi.mock('../../../utils/notify', () => ({
    default: notify,
}));

vi.mock('../DeleteConfirmModal', () => ({
    default: ({ isOpen, onConfirm }) => (
        isOpen ? <button type="button" onClick={onConfirm}>Confirm Delete</button> : null
    ),
}));

describe('ActivityModesModal', () => {
    const createMutation = { mutateAsync: vi.fn(), isPending: false };
    const updateMutation = { mutateAsync: vi.fn(), isPending: false };
    const deleteMutation = { mutateAsync: vi.fn(), isPending: false };

    beforeEach(() => {
        vi.clearAllMocks();
        useActivityModes.mockReturnValue({ activityModes: [], isLoading: false });
        useCreateActivityMode.mockReturnValue(createMutation);
        useUpdateActivityMode.mockReturnValue(updateMutation);
        useDeleteActivityMode.mockReturnValue(deleteMutation);
        createMutation.mutateAsync.mockResolvedValue({});
        updateMutation.mutateAsync.mockResolvedValue({});
        deleteMutation.mutateAsync.mockResolvedValue({});
    });

    it('creates a new activity mode', async () => {
        render(<ActivityModesModal isOpen={true} onClose={vi.fn()} rootId="root-1" />);

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Technique' } });
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Tempo work' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Mode' }));

        await waitFor(() => {
            expect(createMutation.mutateAsync).toHaveBeenCalledWith({
                name: 'Technique',
                description: 'Tempo work',
                color: '#5F9DF7',
            });
        });
        expect(notify.success).toHaveBeenCalledWith('Activity mode created');
    });

    it('updates and deletes an existing activity mode', async () => {
        useActivityModes.mockReturnValue({
            activityModes: [
                {
                    id: 'mode-1',
                    name: 'Strength',
                    description: 'Heavy work',
                    color: '#2255DD',
                },
            ],
            isLoading: false,
        });

        render(<ActivityModesModal isOpen={true} onClose={vi.fn()} rootId="root-1" />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Power' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

        await waitFor(() => {
            expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
                modeId: 'mode-1',
                name: 'Power',
                description: 'Heavy work',
                color: '#2255DD',
            });
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

        await waitFor(() => {
            expect(deleteMutation.mutateAsync).toHaveBeenCalledWith('mode-1');
        });
    });
});
