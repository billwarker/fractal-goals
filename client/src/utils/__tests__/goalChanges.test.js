import { publishGoalChangesFromResponse, rootIdFromApiUrl, subscribeGoalChanges } from '../goalChanges';

describe('goalChanges', () => {
    it('reads the fractal from an API url', () => {
        expect(rootIdFromApiUrl('/api/root-1/sessions/quick-complete')).toBe('root-1');
        expect(rootIdFromApiUrl('http://host/api/root-2/activity-instances/a/complete?x=1')).toBe('root-2');
        expect(rootIdFromApiUrl('/health')).toBeNull();
    });

    it('announces a write response\'s goal changes and passes the response on', () => {
        const handler = vi.fn();
        const unsubscribe = subscribeGoalChanges(handler);
        const goal = { id: 'g1', name: 'Full Front Lever', type: 'ShortTermGoal' };
        const response = {
            config: { url: '/api/root-1/sessions/quick-complete' },
            data: { id: 's1', goal_changes: { completed: [goal], uncompleted: [] } },
        };

        expect(publishGoalChangesFromResponse(response)).toBe(response);
        expect(handler).toHaveBeenCalledWith({ rootId: 'root-1', completed: [goal], uncompleted: [] });

        handler.mockClear();
        publishGoalChangesFromResponse({ config: { url: '/api/root-1/x' }, data: { id: 's1' } });
        publishGoalChangesFromResponse({ config: { url: '/api/root-1/x' }, data: { goal_changes: { completed: [], uncompleted: [] } } });
        expect(handler).not.toHaveBeenCalled();
        unsubscribe();
    });
});
