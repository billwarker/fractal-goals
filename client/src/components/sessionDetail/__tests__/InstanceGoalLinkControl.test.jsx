import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstanceGoalLinkControl from '../InstanceGoalLinkControl';
import { queryKeys } from '../../../hooks/queryKeys';
const api = vi.hoisted(() => ({ associateActivityInstanceGoal: vi.fn(), removeActivityInstanceGoal: vi.fn() }));
vi.mock('../../../utils/api', () => ({ fractalApi: api }));
const instance = { id: 'instance', activity_definition_id: 'definition', associated_goal_ids: [] };
const scope = { goal: { id: 'goal', name: 'Practice', scopePresentation: { icon: 'square', color: '#12ab34', secondaryColor: '#abcdef' } }, activityIds: [] };
function setup(props = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(queryKeys.sessionActivities('root', 'session'), [instance, { ...instance, id: 'sibling' }]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = render(<InstanceGoalLinkControl rootId="root" sessionId="session" instance={instance} scope={scope} {...props} />, { wrapper });
    return { client, invalidate, ...view };
}
beforeEach(() => vi.clearAllMocks());
describe('one-off goal control', () => {
    it('associates only this instance and invalidates evidence queries', async () => {
        api.associateActivityInstanceGoal.mockResolvedValue({ data: { associated_goal_ids: ['goal'] } });
        const { client, invalidate } = setup();
        const button = screen.getByRole('button', { name: 'Associate with Practice' });
        expect(button.textContent).toBe('');
        expect(button.querySelector('rect[fill="#12ab34"]')).toBeInTheDocument();
        expect(button.querySelector('svg')).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button);
        await waitFor(() => expect(client.getQueryData(queryKeys.sessionActivities('root', 'session'))[0].associated_goal_ids).toEqual(['goal']));
        expect(api.associateActivityInstanceGoal).toHaveBeenCalledWith('root', 'instance', 'goal');
        expect(client.getQueryData(queryKeys.sessionActivities('root', 'session'))[1].associated_goal_ids).toEqual([]);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.goalTimelinesRoot('root') });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.targetAnalyticsFractalRoot('root') });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.sessionGoalsView('root', 'session') });
    });
    it('removes explicit links while explaining broader attribution', async () => {
        api.removeActivityInstanceGoal.mockResolvedValue({ data: { associated_goal_ids: [] } });
        setup({ instance: { ...instance, associated_goal_ids: ['goal'] }, scope: { ...scope, activityIds: ['definition'] } });
        const button = screen.getByRole('button', { name: 'Remove instance association with Practice' });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/Definition or group links also apply/)).not.toBeInTheDocument();
        fireEvent.mouseEnter(button);
        expect(screen.getByRole('tooltip')).toHaveTextContent(/Definition or group links also apply/);
        fireEvent.mouseLeave(button);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        fireEvent.focus(button);
        expect(screen.getByRole('tooltip')).toHaveTextContent('Remove instance association with Practice');
        expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
        fireEvent.click(button);
        await waitFor(() => expect(api.removeActivityInstanceGoal).toHaveBeenCalledWith('root', 'instance', 'goal'));
    });
    it('blocks repeated clicks and retains the submitted scope while pending', async () => {
        let resolve;
        api.associateActivityInstanceGoal.mockImplementation(() => new Promise((done) => { resolve = done; }));
        const { rerender } = setup();
        const button = screen.getByRole('button', { name: 'Associate with Practice' });
        fireEvent.click(button);
        fireEvent.click(button);
        await waitFor(() => expect(button).toBeDisabled());
        expect(api.associateActivityInstanceGoal).toHaveBeenCalledTimes(1);
        rerender(<InstanceGoalLinkControl rootId="root" sessionId="session" instance={instance} scope={{ ...scope, goal: { id: 'other', name: 'Other' } }} />);
        expect(screen.getByRole('button', { name: 'Associate with Other' })).toBeDisabled();
        await act(async () => resolve({ data: { associated_goal_ids: ['goal'] } }));
        expect(api.associateActivityInstanceGoal).toHaveBeenCalledWith('root', 'instance', 'goal');
    });
    it('preserves the association and allows retry after failure', async () => {
        api.removeActivityInstanceGoal.mockRejectedValue(new Error('Network unavailable'));
        setup({ instance: { ...instance, associated_goal_ids: ['goal'] } });
        fireEvent.click(screen.getByRole('button', { name: 'Remove instance association with Practice' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'));
        expect(screen.getByRole('button', { name: 'Remove instance association with Practice' })).toBeEnabled();
    });
    it('renders no control without goal scope', () => {
        setup({ scope: null });
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
