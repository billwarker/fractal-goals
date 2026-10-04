import React from 'react';

import Button from '../atoms/Button';
import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import { formatLiteralDate } from '../../utils/dateUtils';
import { formatProgramCalendarRange } from '../../utils/programCalendarContext';
import ProgramSidebar from './ProgramSidebar';
import ProgramDayPane from './ProgramDayPane';
import ProgramBlocksSummary from './ProgramBlocksSummary';
import ProgramOverview from './ProgramOverview';
import styles from './ProgramSidePane.module.css';

export default function ProgramSidePane({
    program,
    goals,
    onCreate,
    onCollapse,
    mode = 'calendar',
    programMetrics,
    programGoalSeeds,
    onGoalClick,
    programMetricsLoading = false,
    programMetricsError = null,
    blockMetrics = null,
    blockMetricsLoading = false,
    blockMetricsError = null,
    rootId,
    scope = 'program',
    contextDate,
    selectedRange,
    selectionLabel = null,
    dayDetailQuery,
    onPreviousDay,
    onNextDay,
    today,
    blocks,
    onScheduleDay,
    onUnscheduleDay,
    onCreateDay,
    getGoalIcon,
    getGoalColor,
    getGoalSecondaryColor,
    timezone = 'UTC',
    onSetDayStatus,
    dayStatusUpdating = false,
    onSetSessionCredit,
    sessionCreditUpdating = false,
    onEditPeriod,
    onEditPlan,
    daysNavigator = null,
    viewToggle = null,
}) {
    const getGoalDetails = (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null;
    const collapseButton = onCollapse
        ? <SidePaneHeaderButton className={styles.collapseButton} onClick={onCollapse}>Collapse</SidePaneHeaderButton>
        : null;
    // Desktop: the page's view toggle leads the pane. The mobile sheet keeps its own headers
    // and a Collapse (close) control.
    const viewSwitcher = viewToggle ? <div className={styles.viewSwitcher}>{viewToggle}</div> : null;
    const paneHeader = (title) => viewSwitcher || (
        <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
            <h2 className={styles.daysPaneTitle}>{title}</h2>
        </SidePaneHeader>
    );

    if (daysNavigator) {
        // The Days tab replaces the pane's review content with its day/template selector.
        return (
            <aside className={styles.sidePane} aria-label="Program side pane">
                {paneHeader('Program days')}
                <div className={styles.daysPaneBody}>{daysNavigator}</div>
            </aside>
        );
    }
    if (mode === 'blocks' && program) {
        // The Blocks view shows every block's whole-program results, not the calendar's selection.
        return (
            <aside className={styles.sidePane} aria-label="Program side pane">
                {paneHeader('Blocks')}
                <div className={styles.detailsPane}>
                    <ProgramBlocksSummary
                        metrics={blockMetrics}
                        loading={blockMetricsLoading}
                        error={blockMetricsError}
                        today={today}
                    />
                </div>
            </aside>
        );
    }
    return (
        <aside className={styles.sidePane} aria-label="Program side pane">
            {viewSwitcher}
            {scope === 'day' ? (
                <header className={styles.dayReviewHeader}>
                    <div className={`${styles.dayReviewHeading} ${collapseButton ? '' : styles.dayReviewHeadingFixed}`.trim()}>
                        <Button unstyled className={styles.dayNavButton} onClick={onPreviousDay} aria-label="Previous day">‹</Button>
                        <div className={styles.dayReviewTitle}>
                            <h2>{formatLiteralDate(contextDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                        </div>
                        <Button unstyled className={styles.dayNavButton} onClick={onNextDay} aria-label="Next day">›</Button>
                        {collapseButton}
                    </div>
                </header>
            ) : scope === 'program' ? (
                viewSwitcher ? null : paneHeader(program?.name || 'Program')
            ) : (
                <SidePaneHeader className={styles.scopedHeader} actions={collapseButton}>
                    <nav className={styles.scopeNav} aria-label="Program scope">
                        <span className={styles.rangeSummary}>
                            <span className={styles.rangeNavLabel}>Selected timeframe</span>
                            <span className={styles.rangeNavDate}>
                                {selectionLabel || formatProgramCalendarRange(selectedRange?.startDate, selectedRange?.endDate)}
                            </span>
                        </span>
                    </nav>
                </SidePaneHeader>
            )}

            {program && scope === 'day' ? (
                <ProgramDayPane
                    rootId={rootId}
                    date={contextDate}
                    today={today}
                    query={dayDetailQuery}
                    program={program}
                    blocks={blocks}
                    onScheduleDay={onScheduleDay}
                    onUnscheduleDay={onUnscheduleDay}
                    onCreateDay={onCreateDay}
                    goals={goals}
                    onGoalClick={onGoalClick}
                    getGoalIcon={getGoalIcon}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    timezone={timezone}
                    onSetDayStatus={onSetDayStatus}
                    dayStatusUpdating={dayStatusUpdating}
                    onSetSessionCredit={onSetSessionCredit}
                    onEditPeriod={onEditPeriod}
                    onEditPlan={onEditPlan}
                    sessionCreditUpdating={sessionCreditUpdating}
                />
            ) : null}

            {program && scope !== 'day' ? (
                <div className={styles.detailsPane}>
                    <ProgramOverview
                        metrics={programMetrics || null}
                        loading={programMetricsLoading}
                        error={programMetricsError}
                        onEditPeriod={onEditPeriod}
                        goalHierarchy={(
                            <ProgramSidebar
                                program={program}
                                programGoalSeeds={programGoalSeeds || []}
                                onGoalClick={onGoalClick || (() => {})}
                                getGoalDetails={getGoalDetails}
                                compact
                                hideMetrics
                                hideGoalsHeader
                                embedded
                            />
                        )}
                    />
                </div>
            ) : null}

            {!program ? (
                <div className={styles.emptySidePane}>
                    <div className={styles.emptySidePaneCard}>
                        <p>No program is scheduled for this day.</p>
                        {(!contextDate || contextDate >= today) ? (
                            <Button unstyled className={styles.emptySidePaneButton} onClick={onCreate}>New Program</Button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </aside>
    );
}
