import { useMemo } from 'react';

import { useActivities, useActivityGroups } from './useActivityQueries';

export function useGoalDetailModalData({
    rootId,
    activityDefinitions,
    activityGroups,
}) {
    const shouldFetchActivities = activityDefinitions === undefined;
    const shouldFetchActivityGroups = activityGroups === undefined;

    const { activities: fetchedActivities = [] } = useActivities(rootId, {
        enabled: shouldFetchActivities,
    });
    const { activityGroups: fetchedActivityGroups = [] } = useActivityGroups(rootId, {
        enabled: shouldFetchActivityGroups,
    });

    const resolvedActivityDefinitions = useMemo(() => (
        Array.isArray(activityDefinitions) ? activityDefinitions : fetchedActivities
    ), [activityDefinitions, fetchedActivities]);

    const resolvedActivityGroups = useMemo(() => (
        Array.isArray(activityGroups) ? activityGroups : fetchedActivityGroups
    ), [activityGroups, fetchedActivityGroups]);

    return {
        activityDefinitions: resolvedActivityDefinitions,
        activityGroups: resolvedActivityGroups,
    };
}

export default useGoalDetailModalData;
