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
            <span>{treeData.children[0].children[1].children[0].name}</span>
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

        expect(screen.getByRole('heading', { name: /define the work/i })).toBeInTheDocument();
        expect(screen.getByText('Composable goal trees')).toBeInTheDocument();
        expect(screen.getByLabelText('Example goal hierarchy tree')).toBeInTheDocument();
        expect(await screen.findByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'tree');
        expect(screen.getByText('Build a resilient practice system')).toBeInTheDocument();
        expect(screen.getByText('Tempo drills')).toBeInTheDocument();

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
        expect(await screen.findByText('You are on the private beta request list.')).toBeInTheDocument();
    });
});
