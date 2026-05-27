import Checkbox from '../atoms/Checkbox';

function MobileHierarchyIcon() {
    return (
        <svg className="mobile-goals-view-icon mobile-goals-hierarchy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 3v18" />
            <path d="M7 8h10" />
            <path d="M7 14h9" />
            <path d="M16 14v5" />
            <path d="M16 19h5" />
        </svg>
    );
}

function MobileTreeIcon() {
    return (
        <svg className="mobile-goals-view-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 3v6" />
            <path d="M11 9L5 15" />
            <path d="M11 9l5 5" />
            <path d="M16 14l5 5" />
            <path d="M16 14l-5 5" />
        </svg>
    );
}

function GoalsViewToggle({ goalsViewMode, onChange, className = '' }) {
    return (
        <div className={`mobile-goals-view-toolbar ${className}`.trim()} aria-label="Mobile goals view">
            <button
                type="button"
                className={`mobile-goals-view-toggle ${goalsViewMode === 'hierarchy' ? 'mobile-goals-view-toggle-active' : ''}`}
                aria-label="Hierarchy"
                title="Hierarchy"
                onClick={() => onChange('hierarchy')}
            >
                <MobileHierarchyIcon />
            </button>
            <button
                type="button"
                className={`mobile-goals-view-toggle ${goalsViewMode === 'tree' ? 'mobile-goals-view-toggle-active' : ''}`}
                aria-label="Tree"
                title="Tree"
                onClick={() => onChange('tree')}
            >
                <MobileTreeIcon />
            </button>
        </div>
    );
}

export default function FlowTreeOptionsPane({
    isMobile,
    isMinimized,
    onToggleMinimized,
    goalsViewMode,
    onGoalsViewModeChange,
    viewSettings,
    onToggleViewSetting,
    inactiveBranchTooltip,
    hideInactiveTooltip,
    hideCompletedTooltip,
}) {
    return (
        <div className={`flowtree-options-pane ${isMobile ? 'flowtree-options-pane-mobile' : ''} ${isMinimized ? 'flowtree-options-pane-minimized' : ''}`}>
            <div className="flowtree-options-header">
                <div className="flowtree-options-title">
                    {goalsViewMode === 'hierarchy' ? 'Hierarchy View' : 'Tree View'}
                </div>
                <div className="flowtree-options-header-actions">
                    <GoalsViewToggle
                        goalsViewMode={goalsViewMode}
                        onChange={onGoalsViewModeChange}
                        className="mobile-goals-view-toolbar-integrated"
                    />
                    <button
                        type="button"
                        className="flowtree-options-minimize-btn"
                        onClick={onToggleMinimized}
                        aria-label={isMinimized ? 'Expand tree view options' : 'Minimize tree view options'}
                        title={isMinimized ? 'Expand' : 'Minimize'}
                    >
                        {isMinimized ? '+' : '-'}
                    </button>
                </div>
            </div>
            {!isMinimized && (
                <>
                    <Checkbox
                        label={<span title={inactiveBranchTooltip}>Fade inactive branches</span>}
                        checked={viewSettings.fadeInactiveBranches}
                        onChange={onToggleViewSetting('fadeInactiveBranches')}
                    />
                    <Checkbox
                        label={<span title={hideInactiveTooltip}>Hide inactive goals</span>}
                        checked={viewSettings.hideInactiveGoals}
                        onChange={onToggleViewSetting('hideInactiveGoals')}
                    />
                    <Checkbox
                        label={<span title={hideCompletedTooltip}>Hide completed goals</span>}
                        checked={viewSettings.hideCompletedGoals}
                        onChange={onToggleViewSetting('hideCompletedGoals')}
                    />
                    <Checkbox
                        label="Show metrics overlay"
                        checked={viewSettings.showMetricsOverlay}
                        onChange={onToggleViewSetting('showMetricsOverlay')}
                    />
                </>
            )}
        </div>
    );
}
