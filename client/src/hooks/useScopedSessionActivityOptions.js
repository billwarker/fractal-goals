import { useMemo } from 'react';

import {
    filterActivitiesForGoalScope,
    filterCircuitsForGoalScope,
} from '../utils/sessionActivityScope';

export default function useScopedSessionActivityOptions(
    activities,
    circuitDefinitions,
    activityGoalScope
) {
    const scopedActivities = useMemo(
        () => filterActivitiesForGoalScope(activities, activityGoalScope),
        [activities, activityGoalScope]
    );
    const scopedCircuitDefinitions = useMemo(
        () => filterCircuitsForGoalScope(circuitDefinitions, activityGoalScope),
        [activityGoalScope, circuitDefinitions]
    );
    return { scopedActivities, scopedCircuitDefinitions };
}
