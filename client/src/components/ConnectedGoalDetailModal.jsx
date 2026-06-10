import React from 'react';

import useGoalDetailModalData from '../hooks/useGoalDetailModalData';
import GoalDetailModal from './GoalDetailModal';

/**
 * App-level boundary for goal details.
 *
 * Pages and feature components should import this connected wrapper, not the raw
 * GoalDetailModal. The wrapper owns root-scoped activity data so activity groups
 * stay available regardless of where the modal is opened.
 */
function ConnectedGoalDetailModal({
    rootId,
    activityDefinitions,
    activityGroups,
    readOnly = false,
    ...props
}) {
    const modalData = useGoalDetailModalData({
        rootId,
        activityDefinitions,
        activityGroups,
        enabled: !readOnly,
    });

    return (
        <GoalDetailModal
            {...props}
            rootId={rootId}
            readOnly={readOnly}
            activityDefinitions={modalData.activityDefinitions}
            activityGroups={modalData.activityGroups}
        />
    );
}

export default ConnectedGoalDetailModal;
