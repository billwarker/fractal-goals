import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Landing from '../Landing';

const { createBetaSignup } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    publicApi: {
        createBetaSignup: (...args) => createBetaSignup(...args),
    },
}));

vi.mock('../../components/atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));

vi.mock('../../FlowTree', () => ({
    default: ({ treeData, layoutMode }) => (
        <div data-testid="flow-tree-demo" data-layout-mode={layoutMode}>
            <span>{treeData.name}</span>
            <span>{treeData.children[0].children[0].children[0].name}</span>
        </div>
    ),
}));

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the beta signup page and submits a request', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });

        render(<Landing />);

        expect(screen.getByRole('heading', { name: /track every goal, program, and training session/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /want to achieve big goals/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /if you're training for more than one thing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Guitar practice tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(await screen.findByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'tree');
        expect(screen.getAllByText('Become a skilled guitar player').length).toBeGreaterThan(0);
        expect(screen.getByText('Practice CAGED triads')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Chinese language tracker' }));
        expect(screen.getByRole('tab', { name: 'Chinese language tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Goal Trees - Break big goals into trackable pieces')).toBeInTheDocument();
        expect(screen.getAllByText('Shadow 10 minutes').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'Next feature' }));
        expect(screen.getByText('Programs - Turn goals into a repeatable weekly plan')).toBeInTheDocument();
        expect(screen.getByText('Tutor prep')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Common questions' })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Will Tester' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'will@example.com' } });
        fireEvent.change(screen.getByLabelText(/testing focus/i), { target: { value: 'creative practice' } });
        fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'I want to track practice.' } });

        fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

        await waitFor(() => {
            expect(createBetaSignup).toHaveBeenCalledWith({
                name: 'Will Tester',
                email: 'will@example.com',
                use_case: 'creative practice',
                note: 'I want to track practice.',
            });
        });
        expect(await screen.findByText("You're on the private beta request list.")).toBeInTheDocument();
    });
});
