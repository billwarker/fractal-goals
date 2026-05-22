import React from 'react';
import { render } from '@testing-library/react';

import ConnectedGoalDetailModal from '../ConnectedGoalDetailModal';

const modalSpy = vi.fn();
const useActivitiesSpy = vi.fn();
const useActivityGroupsSpy = vi.fn();

vi.mock('../GoalDetailModal', () => ({
    default: (props) => {
        modalSpy(props);
        return <div data-testid="goal-detail-modal" />;
    },
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: (...args) => useActivitiesSpy(...args),
    useActivityGroups: (...args) => useActivityGroupsSpy(...args),
}));

describe('ConnectedGoalDetailModal', () => {
    beforeEach(() => {
        modalSpy.mockClear();
        useActivitiesSpy.mockReset();
        useActivityGroupsSpy.mockReset();
        useActivitiesSpy.mockReturnValue({ activities: [{ id: 'activity-1', name: 'Fetched Activity' }] });
        useActivityGroupsSpy.mockReturnValue({ activityGroups: [{ id: 'group-1', name: 'Fetched Group' }] });
    });

    it('fetches and supplies activity data when callers omit it', () => {
        render(
            <ConnectedGoalDetailModal
                isOpen
                rootId="root-1"
                goal={{ id: 'goal-1' }}
            />
        );

        expect(useActivitiesSpy).toHaveBeenCalledWith('root-1', { enabled: true });
        expect(useActivityGroupsSpy).toHaveBeenCalledWith('root-1', { enabled: true });
        expect(modalSpy).toHaveBeenCalledWith(expect.objectContaining({
            activityDefinitions: [{ id: 'activity-1', name: 'Fetched Activity' }],
            activityGroups: [{ id: 'group-1', name: 'Fetched Group' }],
        }));
    });

    it('treats an explicit empty group list as intentional and does not fetch groups', () => {
        render(
            <ConnectedGoalDetailModal
                isOpen
                rootId="root-1"
                goal={{ id: 'goal-1' }}
                activityDefinitions={[]}
                activityGroups={[]}
            />
        );

        expect(useActivitiesSpy).toHaveBeenCalledWith('root-1', { enabled: false });
        expect(useActivityGroupsSpy).toHaveBeenCalledWith('root-1', { enabled: false });
        expect(modalSpy).toHaveBeenCalledWith(expect.objectContaining({
            activityDefinitions: [],
            activityGroups: [],
        }));
    });
});
