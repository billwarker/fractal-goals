import React from 'react';
import FlowTree from '../FlowTree';
import { calculateMetrics } from '../utils/metricsHelpers';

const FractalView = ({
    treeData,
    practiceSessions,
    ...props
}) => {
    const metrics = calculateMetrics(treeData, practiceSessions);

    return (
        <>
            <div className="metrics-overlay">
                <div className="metric-item">{metrics.totalGoals} goals</div>
                <div className="metric-item">{metrics.practiceSessionCount} sessions</div>
                <div className="metric-item">{metrics.completionPercentage}% complete</div>
            </div>

            <FlowTree
                treeData={treeData}
                {...props}
            />
        </>
    );
};

export default FractalView;
