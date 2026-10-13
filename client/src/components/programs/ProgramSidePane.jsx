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
import { ProgramPlusIcon } from './ProgramSvgIcons';
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
    onMoveDay,
    moveDraft, onMoveDraftChange,
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
    onCreateBlock = null,
    onCreateEvent = null,
    onEditPlan,
    daysNavigator = null,
    daysGoals = null,
    view = 'details',
    onViewChange = () => {},
}) {
    const getGoalDetails = (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null;
    // "Month 1 · Week 3" under a scoped date: the block covering it, and its week when tracked.
    const dayBlockLabel = scope === 'day' && contextDate
        ? blockWeekLabel(blockForDate(program?.blocks || blocks, contextDate), contextDate)
        : '';
    const collapseButton = onCollapse ? (
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

    if (daysNavigator) {
        // The Days tab replaces the pane's review content with its day/template selector
        // (Details) and the active plan's goal hierarchy (Goals).
        const showDaysGoals = Boolean(daysGoals) && view === 'goals';
        return (
            <aside className={styles.sidePane} aria-label="Program side pane">
                <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
                    {daysGoals ? subViewToggle : <h2 className={styles.daysPaneTitle}>Program days</h2>}
                </SidePaneHeader>
                {showDaysGoals
                    ? <div className={styles.goalsPane}>{daysGoals}</div>
                    : <div className={styles.daysPaneBody}>{daysNavigator}</div>}
            </aside>
        );
    }
    return (
        <aside className={styles.sidePane} aria-label="Program side pane">
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
                <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
                    {program ? subViewToggle : <h2 className={styles.daysPaneTitle}>Program</h2>}
                </SidePaneHeader>
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
                    onMoveDay={onMoveDay}
                    moveDraft={moveDraft}
                    onMoveDraftChange={onMoveDraftChange}
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

            {program && scope !== 'day' && activeView === 'details' && (onCreateBlock || onCreateEvent) ? (
                <footer className={styles.detailsFooter}>
                    {onCreateBlock ? (
                        <button type="button" className={styles.createButton} onClick={onCreateBlock}>
                            <ProgramPlusIcon size={14} />
                            New block
                        </button>
                    ) : null}
                    {onCreateEvent ? (
                        <button type="button" className={styles.createButton} onClick={onCreateEvent}>
                            <ProgramPlusIcon size={14} />
                            New event
                        </button>
                    ) : null}
                </footer>
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
