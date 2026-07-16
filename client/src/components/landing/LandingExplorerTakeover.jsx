import React, { Suspense, lazy, useState } from 'react';
import FlowTreeOptionsPane from '../flowTree/FlowTreeOptionsPane';
import GoalIcon from '../atoms/GoalIcon';
import { GoalLevelsProvider } from '../../contexts/GoalLevelsContext';
import LandingGoalCards from './LandingGoalCards';
import LandingSkeleton from './LandingSkeleton';
import LandingTakeoverShell from './LandingTakeoverShell';
import styles from './LandingExplorerTakeover.module.css';

// Same modules as Landing's lazy imports, so the chunks are shared and
// already warm by the time the takeover opens from the inline preview.
const FlowTree = lazy(() => import('../../FlowTree'));
const GoalDetailModal = lazy(() => import('../ConnectedGoalDetailModal'));

/**
 * Immersive full-screen goal explorer for compact (mobile/tablet) landing
 * viewports, where the inline tree preview stays locked. Hosts the fully
 * interactive FlowTree with the same shared state (view settings, selected
 * goal, demo highlights) as the inline preview, so closing the takeover keeps
 * the explored state. Example switching stays with the fixed icon tray, which
 * floats above this shell.
 */
export default function LandingExplorerTakeover({
    example,
    flowTreeRef,
    flowTreeScopeKey,
    viewSettings,
    onToggleViewSetting,
    goalsViewMode,
    onGoalsViewModeChange,
    selectedGoalId,
    selectedGoal = null,
    goalDetailEntry = { view: 'goal', key: 0 },
    seedLevels = [],
    onNodeClick,
    onClearSelectedGoal,
    onTargetOpen,
    goalDemos,
    cardStyles,
    onCanvasElement,
    escapeDisabled = false,
    onEscape,
    onClose,
}) {
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(true);

    return (
        <LandingTakeoverShell
            title={(
                <>
                    <span className={styles.titleIcon} aria-hidden="true">
                        <GoalIcon {...example.rootIcon} size={26} />
                    </span>
                    <span className={styles.titleText}>{example.root}</span>
                </>
            )}
            ariaLabel={`${example.root} goal explorer`}
            onClose={onClose}
            onEscape={onEscape}
            escapeDisabled={escapeDisabled}
        >
            <div ref={onCanvasElement} className={styles.canvas} aria-label={`${example.root} goal tree`}>
                <div className={styles.viewport}>
                    <FlowTreeOptionsPane
                        isMobile
                        isMinimized={isOptionsPaneMinimized}
                        onToggleMinimized={() => setIsOptionsPaneMinimized((prev) => !prev)}
                        goalsViewMode={goalsViewMode}
                        onGoalsViewModeChange={onGoalsViewModeChange}
                        viewSettings={viewSettings}
                        onToggleViewSetting={onToggleViewSetting}
                        inactiveBranchTooltip="Dims branches with no recent completed activity evidence."
                        hideInactiveTooltip="Hides goals with no completed activity evidence in the active window."
                        hideCompletedTooltip="Hides completed goals from the fractal tree."
                    />
                    <Suspense fallback={<LandingSkeleton height="100%" width="100%" />}>
                        <FlowTree
                            ref={flowTreeRef}
                            key={example.id}
                            treeData={example.tree}
                            onNodeClick={onNodeClick}
                            onAddChild={null}
                            viewSettings={viewSettings}
                            evidenceGoalIds={example.evidenceGoalIds}
                            metricsSummary={example.metricsSummary}
                            programs={example.programs}
                            layoutMode={goalsViewMode}
                            selectedNodeId={selectedGoalId}
                            zoomTargetNodeId={selectedGoalId}
                            scopeTransitionKey={flowTreeScopeKey}
                            sidebarOpen={false}
                            interactionLocked={false}
                        />
                    </Suspense>
                </div>
                {selectedGoal && (
                    // Goal detail takes over the example canvas entirely — a
                    // clean modal showcase framed by the takeover chrome (title,
                    // tray, demo cards) rather than a page-eclipsing modal.
                    <div className="details-window sidebar docked landing-goal-dock landing-goal-sheet">
                        <div className="window-content landing-goal-dock-content">
                            <Suspense fallback={<LandingSkeleton height="100%" width="100%" />}>
                                <GoalLevelsProvider seedLevels={seedLevels}>
                                    <GoalDetailModal
                                        isOpen
                                        onClose={onClearSelectedGoal}
                                        goal={selectedGoal}
                                        rootId={example.id}
                                        treeData={example.tree}
                                        activityDefinitions={example.activityDefinitions}
                                        activityGroups={example.activityGroups}
                                        displayMode="panel"
                                        readOnly
                                        initialView={goalDetailEntry.view}
                                        initialViewKey={goalDetailEntry.key}
                                        onGoalSelect={onNodeClick}
                                        onTargetOpen={onTargetOpen}
                                    />
                                </GoalLevelsProvider>
                            </Suspense>
                        </div>
                    </div>
                )}
            </div>
            {goalDemos?.cards?.length > 0 && (
                <div className={styles.demoRow}>
                    <LandingGoalCards
                        cards={goalDemos.cards}
                        activeState={goalDemos.activeState}
                        onActivate={goalDemos.activate}
                        selectedGoalId={selectedGoalId}
                        styles={cardStyles}
                    />
                </div>
            )}
        </LandingTakeoverShell>
    );
}
