/**
 * GlobalSidePane - Main container for the context-aware side panel
 * 
 * Features:
 * - Shows on all pages
 * - Context header with back navigation
 * - Mode tabs (Notes, Details, History, etc.)
 * - Collapsible with trigger button
 * - Mobile responsive (bottom sheet)
 */

import React from 'react';
import { useSidePane } from './SidePaneContext';
import SidePaneHeader from './SidePaneHeader';
import SidePaneModeTabs from './SidePaneModeTabs';
import SidePaneTrigger from './SidePaneTrigger';
import NotesMode from './modes/NotesMode';
import DetailsMode from './modes/DetailsMode';
import HistoryMode from './modes/HistoryMode';
import RelatedMode from './modes/RelatedMode';
import AnalyticsMode from './modes/AnalyticsMode';
import ActionsMode from './modes/ActionsMode';
import './GlobalSidePane.css';

const MODE_COMPONENTS = {
    notes: NotesMode,
    details: DetailsMode,
    history: HistoryMode,
    related: RelatedMode,
    analytics: AnalyticsMode,
    actions: ActionsMode,
};

const GlobalSidePane = () => {
    const {
        isOpen,
        position,
        activeMode,
        activeContext,
        hasItemContext,
        goBack,
        toggle
    } = useSidePane();

    const availableModes = activeContext?.availableModes || ['notes'];
    const ActiveModeComponent = MODE_COMPONENTS[activeMode] || NotesMode;

    // Media query hook for mobile detection
    const [isMobile, setIsMobile] = React.useState(false);

    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Mobile bottom sheet
    if (isMobile) {
        return (
            <>
                {/* Floating trigger button */}
                <button
                    className="sidepane-mobile-trigger"
                    onClick={toggle}
                    title="Toggle panel"
                >
                    📝
                </button>

                {/* Backdrop */}
                {isOpen && (
                    <div
                        className="sidepane-backdrop"
                        onClick={toggle}
                    />
                )}

                {/* Bottom Sheet */}
                <div className={`mobile-sidepane ${isOpen ? 'open' : ''}`}>
                    <div className="mobile-sidepane-handle" onClick={toggle} />

                    <SidePaneHeader
                        title={activeContext?.name || 'Context'}
                        showBack={hasItemContext}
                        onBack={goBack}
                        onClose={toggle}
                    />

                    <SidePaneModeTabs modes={availableModes} />

                    <div className="sidepane-content">
                        <ActiveModeComponent />
                    </div>
                </div>
            </>
        );
    }

    // Desktop panel
    return (
        <aside className={`global-sidepane ${position} ${isOpen ? 'open' : 'collapsed'}`}>
            {isOpen ? (
                <>
                    {/* Header */}
                    <SidePaneHeader
                        title={activeContext?.name || 'Context'}
                        showBack={hasItemContext}
                        onBack={goBack}
                        onClose={toggle}
                    />

                    {/* Mode Tabs */}
                    <SidePaneModeTabs modes={availableModes} />

                    {/* Mode Content */}
                    <div className="sidepane-content">
                        <ActiveModeComponent />
                    </div>
                </>
            ) : (
                <SidePaneTrigger />
            )}
        </aside>
    );
};

export default GlobalSidePane;
