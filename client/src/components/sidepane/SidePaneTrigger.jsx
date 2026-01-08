/**
 * SidePaneTrigger - Trigger button shown when SidePane is collapsed
 */

import React from 'react';
import { useSidePane } from './SidePaneContext';

const SidePaneTrigger = () => {
    const { toggle, position } = useSidePane();

    return (
        <div className="sidepane-trigger">
            <button
                className="sidepane-trigger-btn"
                onClick={toggle}
                title="Open panel"
            >
                <span className="sidepane-trigger-icon">
                    {position === 'right' ? '◀' : '▶'}
                </span>
                <span className="sidepane-trigger-label">📝</span>
            </button>
        </div>
    );
};

export default SidePaneTrigger;
