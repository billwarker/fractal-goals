/**
 * SidePaneModeTabs - Tab navigation for SidePane modes
 */

import React from 'react';
import { useSidePane } from './SidePaneContext';

const MODE_CONFIG = {
    notes: { icon: '📝', label: 'Notes' },
    details: { icon: '📋', label: 'Details' },
    history: { icon: '📜', label: 'History' },
    related: { icon: '🔗', label: 'Related' },
    analytics: { icon: '📊', label: 'Analytics' },
    actions: { icon: '⚡', label: 'Actions' },
};

const SidePaneModeTabs = ({ modes }) => {
    const { activeMode, setActiveMode } = useSidePane();

    if (!modes || modes.length <= 1) {
        return null; // Don't show tabs if only one mode
    }

    return (
        <div className="sidepane-tabs">
            {modes.map(mode => {
                const config = MODE_CONFIG[mode] || { icon: '?', label: mode };
                const isActive = activeMode === mode;

                return (
                    <button
                        key={mode}
                        className={`sidepane-tab ${isActive ? 'active' : ''}`}
                        onClick={() => setActiveMode(mode)}
                        title={config.label}
                    >
                        <span className="sidepane-tab-icon">{config.icon}</span>
                        <span className="sidepane-tab-label">{config.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default SidePaneModeTabs;
