import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import TargetManager from '../TargetManager';

const { targetMutationMocks } = vi.hoisted(() => ({
    targetMutationMocks: {
        createTarget: vi.fn(() => Promise.resolve({ targets: [] })),
        updateTarget: vi.fn(() => Promise.resolve({ targets: [] })),
        deleteTarget: vi.fn(() => Promise.resolve({ targets: [] })),
    },
}));

vi.mock('../../../hooks/useProgramQueries', () => ({
    usePrograms: () => ({ programs: [] }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getLevelByName: () => ({ icon: 'circle' }),
        getGoalColor: (type) => (type === 'Completed' ? '#4caf50' : '#22d3ee'),
        getGoalSecondaryColor: (type) => (type === 'Completed' ? '#2e7d32' : '#0f766e'),
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../../../hooks/useTargetQueries', () => ({
    useTargetMutations: () => targetMutationMocks,
}));

vi.mock('../../../utils/notify', () => ({
    default: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const RENDER_OPTIONS = { withTheme: false, withAuth: false, withGoalLevels: false, withTimezone: false };

const metricActivity = {
    id: 'activity-1',
    name: 'Handstand Practice',
    has_metrics: true,
    metric_definitions: [
        { id: 'form', name: 'Form', unit: 'Rating' },
    ],
};

function setup(overrides = {}) {
    const setTargets = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(
        <TargetManager
            targets={[]}
            setTargets={setTargets}
            activityDefinitions={[metricActivity]}
            associatedActivities={[metricActivity]}
            goalId="goal-1"
            rootId="root-1"
            isEditing={false}
            viewMode="builder"
            initialActivityId="activity-1"
            lockActivitySelection
            onSaved={onSaved}
            {...overrides}
        />,
        RENDER_OPTIONS
    );
    return { setTargets, onSaved };
}

describe('TargetManager builder', () => {
    beforeEach(() => {
        targetMutationMocks.createTarget.mockClear();
        targetMutationMocks.updateTarget.mockClear();
        targetMutationMocks.deleteTarget.mockClear();
    });

    it('keeps the name field clearable while using the metric-derived name as default', async () => {
        const { onSaved } = setup();

        const [nameInput] = screen.getAllByRole('textbox');
        expect(nameInput).not.toHaveAttribute('placeholder', 'Handstand Practice');

        await waitFor(() => expect(nameInput).toHaveAttribute('placeholder', 'Form ≥ 0'));
        expect(nameInput).toHaveValue('');

        fireEvent.change(nameInput, { target: { value: 'Custom target' } });
        expect(nameInput).toHaveValue('Custom target');

        fireEvent.change(nameInput, { target: { value: '' } });
        expect(nameInput).toHaveValue('');

        fireEvent.click(screen.getByRole('button', { name: 'Add Target' }));
        await waitFor(() => {
            expect(targetMutationMocks.createTarget).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Form ≥ 0' })
            );
        });
        await waitFor(() => {
            expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
                action: 'create',
                targets: [],
            }));
        });
    });

    it('confirms before deleting from a target card', async () => {
        setup({
            viewMode: 'list',
            targets: [{
                id: 'target-1',
                activity_id: 'activity-1',
                name: 'Form target',
                type: 'threshold',
                metrics: [{ metric_id: 'form', value: 8, operator: '>=' }],
            }],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete target' }));
        expect(targetMutationMocks.deleteTarget).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Delete Target' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Delete Target' }));
        await waitFor(() => {
            expect(targetMutationMocks.deleteTarget).toHaveBeenCalledWith('target-1');
        });
    });

    it('confirms before deleting from the builder edit footer', async () => {
        const target = {
            id: 'target-1',
            activity_id: 'activity-1',
            name: 'Form target',
            type: 'threshold',
            metrics: [{ metric_id: 'form', value: 8, operator: '>=' }],
        };
        const onCloseBuilder = vi.fn();
        setup({
            targets: [target],
            initialTarget: target,
            onCloseBuilder,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete Target' }));
        expect(targetMutationMocks.deleteTarget).not.toHaveBeenCalled();
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Delete Target' })).toBeInTheDocument();
        expect(screen.getByText(/Delete "Form target"/)).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Target' }));
        await waitFor(() => {
            expect(targetMutationMocks.deleteTarget).toHaveBeenCalledWith('target-1');
        });
        expect(onCloseBuilder).toHaveBeenCalled();
    });
});
