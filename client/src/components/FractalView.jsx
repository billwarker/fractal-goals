import React, { useState, useEffect } from 'react';
import FlowTree from '../FlowTree';
import { calculateMetrics } from '../utils/metricsHelpers';

const FractalView = ({
    treeData,
    practiceSessions,
    ...props
}) => {
    // Initialize from localStorage, default to true
    const [showSessions, setShowSessions] = useState(() => {
        const saved = localStorage.getItem('fractalView_showSessions');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [deferredShowSessions, setDeferredShowSessions] = useState(showSessions);
    const metrics = calculateMetrics(treeData, practiceSessions);
    const flowTreeRef = React.useRef();

    // Persist to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('fractalView_showSessions', JSON.stringify(showSessions));
    }, [showSessions]);

    // Delay the actual graph update to allow fade-out animation
    useEffect(() => {
        const timer = setTimeout(() => {
            setDeferredShowSessions(showSessions);
        }, 300); // Wait for fade-out to complete
        return () => clearTimeout(timer);
    }, [showSessions]);

    return (
        <>
            <div className="metrics-overlay">
                <div className="metric-item">{metrics.totalGoals} goals</div>
                <div className="metric-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{metrics.practiceSessionCount} sessions</span>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            borderLeft: '1px solid #666',
                            paddingLeft: '8px',
                            marginLeft: '2px',
                            pointerEvents: 'auto'
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={showSessions}
                            onChange={(e) => {
                                e.stopPropagation();
                                // Trigger IMMEDIATE fade-out via ref
                                if (flowTreeRef.current?.startFadeOut) {
                                    flowTreeRef.current.startFadeOut();
                                }
                                setShowSessions(e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                        />
                        <span style={{ fontSize: '11px', userSelect: 'none' }}>Show</span>
                    </label>
                </div>
                <div className="metric-item">{metrics.completionPercentage}% complete</div>
            </div>

            <FlowTree
                ref={flowTreeRef}
                treeData={treeData}
                practiceSessions={practiceSessions}
                showSessions={deferredShowSessions}
                {...props}
            />
        </>
    );
};

export default FractalView;
