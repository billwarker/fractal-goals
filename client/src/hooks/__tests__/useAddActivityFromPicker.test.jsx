import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OutboxContext } from '../../offline/OutboxContext';
import { SESSION_OP } from '../../offline/opKinds';
import { useAddActivityFromPicker } from '../useActivityInstanceGoalAssociation';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({}) }));

const activity = { id: 'definition', name: 'Bench Press' };
const scope = (ids) => ({ goal: { id: 'goal-1', name: 'Chapter 5' }, instanceLinkedIds: new Set(ids) });

function setup(submit = vi.fn(async () => ({}))) {
    const addActivity = vi.fn(async () => ({ id: 'new-instance' }));
    const wrapper = ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
            <OutboxContext.Provider value={{ submit }}>{children}</OutboxContext.Provider>
        </QueryClientProvider>
    );
    const { result } = renderHook(() => useAddActivityFromPicker('root', 'session', addActivity), { wrapper });
    return { add: result.current, addActivity, submit };
}

describe('useAddActivityFromPicker', () => {
    it('queues a link behind the add for an activity offered only through one-off links', async () => {
        const { add, submit } = setup();
        await add(0, activity, scope(['definition']));
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({
            kind: SESSION_OP.INSTANCE_GOAL_LINK,
            scope: 'session',
            entityIds: ['new-instance'],
            body: { goal_id: 'goal-1' },
        }));
    });

    it('adds without linking a catalog activity, or with no goal scoped', async () => {
        const { add, addActivity, submit } = setup();
        await add(0, activity, scope([]));
        await add(0, activity, null);
        expect(addActivity).toHaveBeenCalledTimes(2);
        expect(submit).not.toHaveBeenCalled();
    });
});
