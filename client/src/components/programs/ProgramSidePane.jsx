import React from 'react';

import Button from '../atoms/Button';
import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ViewToggleTabs from '../common/ViewToggleTabs';
import { formatLiteralDate } from '../../utils/dateUtils';
import { blockWeekLabel } from '../../utils/programBlockWeeks';
import { formatProgramCalendarRange } from '../../utils/programCalendarContext';
import { blockForDate } from '../../utils/programViewModel';
import ProgramSidebar from './ProgramSidebar';
import ProgramDayPane from './ProgramDayPane';
import ProgramOverview from './ProgramOverview';
import styles from './ProgramSidePane.module.css';

export default function ProgramSidePane({
    program,
    goals,
    onCreate,
    onCollapse,
    programMetrics,
    programGoalSeeds,
    onGoalClick,
    programMetricsLoading = false,
    programMetricsError = null,
    blocksPanel = null,
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
    view = 'details',
    onViewChange = () => {},
}) {
    const getGoalDetails = (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null;
    // "Month 1 · Week 3" under a scoped date: the block covering it, and its week when tracked.
    const dayBlockLabel = scope === 'day' && contextDate
        ? blockWeekLabel(blockForDate(program?.blocks || blocks, contextDate), contextDate)
        : '';
    const collapseControl = onCollapse ? (
        <SidePaneHeaderButton className={styles.collapseButton} onClick={onCollapse}>
            Collapse
        </SidePaneHeaderButton>
    ) : null;
    // At program scope the pane splits into Details (metrics, events, blocks) and Goals.
    const subViewToggle = (
        <ViewToggleTabs
            className={styles.sidePaneViewToggle}
            items={[
                { value: 'details', label: 'Details' },
                { value: 'goals', label: 'Goals' },
            ]}
            value={view}
            onChange={onViewChange}
            ariaLabel="Program side pane views"
            style={{ '--view-toggle-panel-bg': 'var(--color-bg-sidebar)' }}
        />
    );
    const showSubViews = Boolean(program) && scope === 'program' && !daysNavigator;
    const activeView = showSubViews ? view : 'details';
    // Desktop: the page's view toggle leads the pane, with Collapse beside it; Details/Goals
    // sits beneath the header line. The mobile sheet keeps its own headers, each carrying
    // the Collapse (close) control.
    const viewSwitcher = viewToggle ? (
        <div className={styles.viewSwitcher}>
            <div className={styles.viewSwitcherToggle}>{viewToggle}</div>
            {collapseControl}
        </div>
    ) : null;
    const collapseButton = viewSwitcher ? null : collapseControl;
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
    return (
        <aside className={styles.sidePane} aria-label="Program side pane">
            {viewSwitcher}
            {scope === 'day' ? (
                <header className={styles.dayReviewHeader}>
                    <div className={`${styles.dayReviewHeading} ${collapseButton ? '' : styles.dayReviewHeadingFixed}`.trim()}>
                        <Button unstyled className={styles.dayNavButton} onClick={onPreviousDay} aria-label="Previous day">‹</Button>
                        <div className={styles.dayReviewTitle}>
                            <h2>{formatLiteralDate(contextDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                            {dayBlockLabel ? <p className={styles.dayReviewContext}>{dayBlockLabel}</p> : null}
                        </div>
                        <Button unstyled className={styles.dayNavButton} onClick={onNextDay} aria-label="Next day">›</Button>
                        {collapseButton}
                    </div>
                </header>
            ) : scope === 'program' ? (
                viewSwitcher ? (
                    showSubViews ? <div className={styles.subViewBar}>{subViewToggle}</div> : null
                ) : (
                    <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
                        {program ? subViewToggle : <h2 className={styles.daysPaneTitle}>Program</h2>}
                    </SidePaneHeader>
                )
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

            {program && scope !== 'day' && activeView === 'details' ? (
                <div className={styles.detailsPane}>
                    <ProgramOverview
                        metrics={programMetrics || null}
                        loading={programMetricsLoading}
                        error={programMetricsError}
                        onEditPeriod={onEditPeriod}
                        // Blocks summarize the whole program, so they show only at program scope.
                        blocks={scope === 'program' ? blocksPanel : null}
                    />
                </div>
            ) : null}

            {program && activeView === 'goals' ? (
                <div className={styles.goalsPane}>
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
