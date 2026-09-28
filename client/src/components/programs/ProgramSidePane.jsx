import React, { useState } from 'react';

import Button from '../atoms/Button';
import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ViewToggleTabs from '../common/ViewToggleTabs';
import DisclosureButton from '../atoms/DisclosureButton';
import { formatLiteralDate } from '../../utils/dateUtils';
import { formatProgramCalendarRange } from '../../utils/programCalendarContext';
import ProgramSidebar from './ProgramSidebar';
import ProgramDayPane from './ProgramDayPane';
import ProgramOverview from './ProgramOverview';
import styles from './ProgramSidePane.module.css';

function ProgramSidePaneSection({
    title,
    collapsed,
    onToggle,
    children,
    className = '',
    contentClassName = '',
}) {
    return (
        <section className={`${styles.sidePaneSectionGroup} ${collapsed ? styles.sidePaneSectionGroupCollapsed : ''} ${className}`.trim()}>
            <div className={styles.sidePaneSectionTitleRow}>
                <div className={styles.sidePaneSectionTitle}>{title}</div>
                <DisclosureButton
                    expanded={!collapsed}
                    className={styles.sidePaneSectionToggle}
                    onClick={onToggle}
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Show' : 'Hide'} ${title}`}
                    title={`${collapsed ? 'Show' : 'Hide'} ${title}`}
                />
            </div>
            {!collapsed ? (
                <div className={`${styles.sidePaneSectionContent} ${contentClassName}`.trim()}>
                    {children}
                </div>
            ) : null}
        </section>
    );
}

export default function ProgramSidePane({
    program,
    goals,
    onCreate,
    onCollapse,
    view,
    onViewChange,
    programMetrics,
    programGoalSeeds,
    onGoalClick,
    programMetricsLoading = false,
    programMetricsError = null,
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
    showSubViews = false,
}) {
    const getGoalDetails = (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null;
    const [collapsedSections, setCollapsedSections] = useState({
        goals: false,
    });
    const toggleSection = (key) => {
        setCollapsedSections((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };
    const collapseButton = onCollapse
        ? <SidePaneHeaderButton className={styles.collapseButton} onClick={onCollapse}>Collapse</SidePaneHeaderButton>
        : null;
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
            style={{
                '--view-toggle-panel-bg': 'var(--color-bg-sidebar)',
            }}
        />
    );
    // Desktop: the page's view toggle leads the pane, with Details/Goals beneath it in the
    // calendar view. The mobile sheet keeps its own headers and a Collapse (close) control.
    const viewSwitcher = viewToggle ? (
        <div className={styles.viewSwitcher}>
            {viewToggle}
            {showSubViews && scope === 'program' ? subViewToggle : null}
        </div>
    ) : null;

    if (daysNavigator) {
        // The Days tab replaces the pane's review content with its day/template selector.
        return (
            <aside className={styles.sidePane} aria-label="Program side pane">
                {viewSwitcher || (
                    <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
                        <h2 className={styles.daysPaneTitle}>Program days</h2>
                    </SidePaneHeader>
                )}
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
                        </div>
                        <Button unstyled className={styles.dayNavButton} onClick={onNextDay} aria-label="Next day">›</Button>
                        {collapseButton}
                    </div>
                </header>
            ) : scope === 'program' ? (
                viewSwitcher ? null : (
                    <SidePaneHeader className={styles.programHeader} actions={collapseButton}>
                        {subViewToggle}
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

            {program && (scope === 'range' || (scope === 'program' && view === 'details')) ? (
                <div className={styles.detailsPane}>
                    <ProgramOverview
                        metrics={programMetrics || null}
                        loading={programMetricsLoading}
                        error={programMetricsError}
                        onEditPeriod={onEditPeriod}
                    />
                </div>
            ) : null}

            {program && scope === 'program' && view === 'goals' ? (
                <div className={styles.goalsPane}>
                    <ProgramSidePaneSection
                        title="Program Goals"
                        collapsed={collapsedSections.goals}
                        onToggle={() => toggleSection('goals')}
                        className={styles.goalsSidePaneSection}
                        contentClassName={styles.goalsSectionContent}
                    >
                        <ProgramSidebar
                            program={program}
                            programGoalSeeds={programGoalSeeds || []}
                            onGoalClick={onGoalClick || (() => {})}
                            getGoalDetails={getGoalDetails}
                            compact
                            hideMetrics
                            hideGoalsHeader
                            className={styles.embeddedSidebar}
                        />
                    </ProgramSidePaneSection>
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
