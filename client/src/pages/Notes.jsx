/**
 * Notes Page — /:rootId/notes
 *
 * - Left: the reverse-chronological timeline. Notes are written where they belong (sessions,
 *   goals, program days); this page reads, edits, pins to next time and deletes them.
 * - Right: heatmap, search, saved filters (combine with AND), category, goal, activity and pinned filters.
 * Filters live in the URL (useNotesPageFilters). Mobile moves the right pane into a sheet.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NoteTimeline } from '../components/notes';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useNotesPageQuery } from '../hooks/useNotesPageQuery';
import { useNotesPageFilters } from '../hooks/useNotesPageFilters';
import { useNoteFilters } from '../hooks/useNoteFilters';
import { useTimezone } from '../contexts/TimezoneContext';
import { useFractalTree } from '../hooks/useGoalQueries';
import { ActivityFilterPicker, GoalFilterModal, goalFilterOptions } from '../components/common/FilterPickerModals';
import EmptyState from '../components/common/EmptyState';
import SidePaneHeader from '../components/common/SidePaneHeader';
import SidePaneHeaderButton from '../components/common/SidePaneHeaderButton';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import MobilePageFooter from '../components/layout/MobilePageFooter';
import NotesMobileSheet from '../components/notes/NotesMobileSheet';
import NotesFilterControls from '../components/notes/page/NotesFilterControls';
import FilterConditions, { filterConditionLabels } from '../components/notes/page/FilterConditions';
import { useOptionalOnboarding } from '../contexts/OnboardingContext';
import styles from './Notes.module.css';

// ─── Main Notes Page ─────────────────────────────────────────────────────────

function Notes() {
    const { rootId } = useParams();
    const onboarding = useOptionalOnboarding();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { activities = [] } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { data: goalTree } = useFractalTree(rootId);
    const goalOptions = useMemo(() => goalFilterOptions(goalTree), [goalTree]);

    const { timezone } = useTimezone();
    const { filters, apiFilters, updateFilters, hasActiveFilters, clearAdHoc, clearAll } = useNotesPageFilters(timezone);
    const { savedFilters, isLoading: savedFiltersLoading, createFilter, updateFilter, deleteFilter } = useNoteFilters(rootId);

    // UI state
    const filtersPaneStorageKey = `notes-filter-pane-open:${rootId || 'default'}`;
    const [isFiltersPaneOpen, setIsFiltersPaneOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = window.localStorage.getItem(`notes-filter-pane-open:${rootId || 'default'}`);
        return getIsMobileViewport() ? false : (stored === null ? true : stored === 'true');
    });
    const [goalPickerOpen, setGoalPickerOpen] = useState(false);
    const [activityPickerOpen, setActivityPickerOpen] = useState(false);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

    /* eslint-disable react-hooks/set-state-in-effect -- Responsive navigation collapses desktop-only panes on entry to mobile. */
    useEffect(() => {
        window.localStorage.setItem(filtersPaneStorageKey, String(isFiltersPaneOpen));
    }, [filtersPaneStorageKey, isFiltersPaneOpen]);

    useEffect(() => {
        if (isMobile) {
            setIsFiltersPaneOpen(false);
            setMobilePanelOpen(false);
        }
    }, [isMobile, rootId]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Ignore saved-filter ids in the URL that no longer exist (deleted elsewhere).
    const activeSavedIds = savedFiltersLoading
        ? filters.savedFilterIds
        : filters.savedFilterIds.filter((id) => savedFilters.some((filter) => filter.id === id));
    const feedFilters = { ...apiFilters, saved_filter_ids: activeSavedIds };

    const {
        notes, total, hasMore, isLoading,
        loadNextPage, updateNote, deleteNote, setCarryForward,
    } = useNotesPageQuery(rootId, feedFilters);

    useEffect(() => { if (!rootId) navigate('/'); }, [rootId, navigate]);

    const toggleSavedFilter = (id) => updateFilters({
        savedFilterIds: activeSavedIds.includes(id) ? activeSavedIds.filter((item) => item !== id) : [...activeSavedIds, id],
    });
    // A new saved filter takes over the conditions it was created from.
    const createSavedFilter = async (name, filterSpec) => {
        const created = await createFilter({ name, spec: filterSpec });
        clearAdHoc({ savedFilterIds: [...activeSavedIds, created.id] });
    };
    const deleteSavedFilter = async (filter) => {
        await deleteFilter(filter.id);
        updateFilters({ savedFilterIds: activeSavedIds.filter((id) => id !== filter.id) });
    };

    const goalNames = Object.fromEntries(goalOptions.map((goal) => [goal.id, goal.name]));
    const activityNames = Object.fromEntries(activities.map((activity) => [activity.id, activity.name]));
    const summarize = (ids, names) => (ids.length > 2 ? `${ids.length} selected` : ids.map((id) => names[id] || '…').join(', '));
    const conditionLabels = filterConditionLabels({ filters, savedFilters, activeSavedIds, goalNames, activityNames });
    const mobilePanelLabel = mobilePanelOpen ? 'Hide Filters' : 'Show Filters';

    /* ─── Left column ─── */
    const leftColumn = (
        <div className={styles.leftColumn}>
            <PageHeader
                title="Notes"
                subtitle={isLoading && notes.length === 0 ? '…' : (
                    <>
                        <span>{`${total} note${total !== 1 ? 's' : ''}`}</span>
                        <FilterConditions labels={conditionLabels} />
                    </>
                )}
                actions={!isMobile ? (
                    <HeaderButton variant="secondary" onClick={() => setIsFiltersPaneOpen(v => !v)}>
                        {isFiltersPaneOpen ? 'Hide Filters' : 'Show Filters'}
                    </HeaderButton>
                ) : null}
            />

            {onboarding?.enabled && onboarding.state?.status === 'active' && !onboarding.state?.steps?.first_session && (
                <EmptyState compact className={styles.onboardingEmptyState} title="Notes preserve the context numbers miss" description="Complete a session, then capture what changed, what worked, and what to adjust next time." />
            )}

            <div className={styles.timelineArea}>
                <NoteTimeline
                    notes={notes}
                    onEdit={updateNote}
                    onDelete={deleteNote}
                    onCarryForward={setCarryForward}
                    showContext={true}
                    noteTypeVariant="metadata"
                    presentation="timeline"
                    groupByDate={true}
                    hasMore={hasMore}
                    onLoadMore={loadNextPage}
                    emptyMessage={hasActiveFilters
                        ? 'No notes match the current filters.'
                        : 'No notes yet. Write them on sessions, goals and program days.'}
                />
            </div>
        </div>
    );

    const filterPanelBody = (
        <div className={styles.filterPanelBody}>
            <NotesFilterControls
                rootId={rootId}
                filters={filters}
                apiFilters={feedFilters}
                updateFilters={updateFilters}
                goalSummary={summarize(filters.goalIds, goalNames)}
                activitySummary={summarize(filters.activityIds, activityNames)}
                onPickGoal={() => setGoalPickerOpen(true)}
                onPickActivities={() => setActivityPickerOpen(true)}
                saved={{
                    savedFilters,
                    activeIds: activeSavedIds,
                    onToggle: toggleSavedFilter,
                    onCreate: createSavedFilter,
                    onUpdate: (filter, name, filterSpec) => updateFilter({ id: filter.id, name, spec: filterSpec }),
                    onDelete: deleteSavedFilter,
                }}
            />
        </div>
    );

    /* ─── Right column filter panel ─── */
    const filterPanel = (
        <div className={styles.filterPanel}>
            <SidePaneHeader
                title="Filters"
                subtitle={isLoading ? '...' : `${total} note${total !== 1 ? 's' : ''} shown`}
                actions={(
                    <>
                    <SidePaneHeaderButton
                        variant="reset"
                        onClick={clearAll}
                        disabled={!hasActiveFilters}
                    >
                        Reset Filters
                    </SidePaneHeaderButton>
                    <SidePaneHeaderButton
                        onClick={() => setIsFiltersPaneOpen(false)}
                        aria-label="Collapse filters panel"
                    >
                        Collapse
                    </SidePaneHeaderButton>
                    </>
                )}
            />

            {filterPanelBody}
        </div>
    );

    const rightColumn = isFiltersPaneOpen && !isMobile && (
        <div className={styles.rightColumn}>
            {filterPanel}
        </div>
    );

    return (
        <div className={`${styles.pageContainer} page-reveal`}>
            {leftColumn}
            {rightColumn}

            {isMobile ? (
                <MobilePageFooter
                    ariaLabel="Note filter controls"
                    label={mobilePanelLabel}
                    expanded={mobilePanelOpen}
                    onToggle={() => setMobilePanelOpen((value) => !value)}
                />
            ) : null}

            <GoalFilterModal
                isOpen={goalPickerOpen}
                goals={goalOptions}
                selectedGoalIds={filters.goalIds}
                onClose={() => setGoalPickerOpen(false)}
                onConfirm={(goalIds) => updateFilters({ goalIds })}
            />
            {activityPickerOpen && (
                <ActivityFilterPicker
                    activities={activities}
                    activityGroups={activityGroups}
                    selectedActivityIds={filters.activityIds}
                    onClose={() => setActivityPickerOpen(false)}
                    onConfirm={(activityIds) => updateFilters({ activityIds })}
                />
            )}

            <NotesMobileSheet
                open={isMobile && mobilePanelOpen}
                total={total}
                hasActiveFilters={hasActiveFilters}
                onReset={clearAll}
                onClose={() => setMobilePanelOpen(false)}
            >
                {filterPanelBody}
            </NotesMobileSheet>
        </div>
    );
}

export default Notes;
