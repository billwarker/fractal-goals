/**
 * Notes Page — /:rootId/notes
 *
 * - Left: saved filters (combine with AND) above the reverse-chronological timeline.
 * - Right: heatmap, search (keyword or regex), category, goal, activity and pinned filters.
 *   While composing, the right pane links the note to a goal or activity instead.
 * Filters live in the URL (useNotesPageFilters). Mobile moves the right pane into a sheet.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NoteTimeline, NoteComposer } from '../components/notes';
import ComposeLinkPanel from '../components/notes/ComposeLinkPanel';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useNotesPageQuery } from '../hooks/useNotesPageQuery';
import { useNotesPageFilters } from '../hooks/useNotesPageFilters';
import { useNoteFilters } from '../hooks/useNoteFilters';
import { useTimezone } from '../contexts/TimezoneContext';
import { useFractalTree } from '../hooks/useGoalQueries';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import CloseButton from '../components/atoms/CloseButton';
import ModalBackdrop from '../components/atoms/ModalBackdrop';
import ActivityFilterModal from '../components/common/ActivityFilterModal';
import GoalTreePicker from '../components/common/GoalTreePicker';
import EmptyState from '../components/common/EmptyState';
import SidePaneHeader from '../components/common/SidePaneHeader';
import SidePaneHeaderButton from '../components/common/SidePaneHeaderButton';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import MobilePageFooter from '../components/layout/MobilePageFooter';
import BodyPortal from '../components/layout/BodyPortal';
import NotesMobileSheet from '../components/notes/NotesMobileSheet';
import NotesFilterControls from '../components/notes/page/NotesFilterControls';
import ActiveFiltersSummary from '../components/notes/page/ActiveFiltersSummary';
import { useOptionalOnboarding } from '../contexts/OnboardingContext';
import styles from './Notes.module.css';

// ─── Goal Picker Modal ───────────────────────────────────────────────────────
function GoalPickerModal({ rootId, selectedGoalId, onSelect, onClose }) {
    const { data: treeData } = useFractalTree(rootId);
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    return (
        <ModalBackdrop className={styles.modalOverlay} onClose={onClose}>
            <div className={styles.modalSheet} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <span className={styles.modalTitle}>Filter by Goal</span>
                    <CloseButton
                        className={styles.modalClose}
                        onClick={onClose}
                        aria-label="Close goal picker"
                        size={16}
                    />
                </div>
                <div className={styles.modalBody}>
                    {selectedGoalId && (
                        <button className={styles.clearSelectionBtn} onClick={() => { onSelect(null, null); onClose(); }}>
                            Clear goal filter
                        </button>
                    )}
                    <GoalTreePicker
                        treeData={treeData}
                        selectedGoalIds={selectedGoalId ? [selectedGoalId] : []}
                        onSelectionChange={(ids, names) => {
                            onSelect(ids[0] || null, names[0] || null);
                            onClose();
                        }}
                        showHideCompleted={true}
                        allowLineageSelection={false}
                        getGoalColor={getGoalColor}
                        getGoalIcon={getGoalIcon}
                        getGoalSecondaryColor={getGoalSecondaryColor}
                    />
                </div>
            </div>
        </ModalBackdrop>
    );
}

// ─── Main Notes Page ─────────────────────────────────────────────────────────

function Notes() {
    const { rootId } = useParams();
    const onboarding = useOptionalOnboarding();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { activities = [] } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);

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
    const [composing, setComposing] = useState(false);
    const [editingNote, setEditingNote] = useState(null); // note object being edited
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

    // Compose link state
    const [composeGoalId, setComposeGoalId] = useState(null);
    const [composeGoalName, setComposeGoalName] = useState(null);
    const [composeActivityId, setComposeActivityId] = useState(null);
    const [composeActivityName, setComposeActivityName] = useState(null);

    // Ignore saved-filter ids in the URL that no longer exist (deleted elsewhere).
    const activeSavedIds = savedFiltersLoading
        ? filters.savedFilterIds
        : filters.savedFilterIds.filter((id) => savedFilters.some((filter) => filter.id === id));
    const feedFilters = { ...apiFilters, saved_filter_ids: activeSavedIds };

    const {
        notes, total, hasMore, isLoading,
        loadNextPage, createNote, updateNote, deleteNote, pinNote, unpinNote,
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

    const resetComposeLinks = () => {
        setComposeGoalId(null);
        setComposeGoalName(null);
        setComposeActivityId(null);
        setComposeActivityName(null);
    };

    const handleCompose = async (content, goalId, activityDefinitionId, attachments = []) => {
        if (editingNote) {
            await updateNote(editingNote.id, content, attachments);
            setEditingNote(null);
        } else {
            const contextType = goalId ? 'goal' : activityDefinitionId ? 'activity_definition' : 'root';
            const contextId = goalId || activityDefinitionId || rootId;
            await createNote({
                content,
                attachments,
                context_type: contextType,
                context_id: contextId,
                goal_id: goalId || undefined,
                activity_definition_id: activityDefinitionId || undefined,
            });
        }
        setComposing(false);
        setMobilePanelOpen(false);
        resetComposeLinks();
    };

    const handleEditRequest = (note) => {
        setEditingNote(note);
        setComposing(true);
        setIsFiltersPaneOpen(true);
        if (isMobile) {
            setMobilePanelOpen(true);
        }
    };

    const handleGoalFilterSelect = (id, name) => updateFilters({ goalId: id, goalName: name || '' });
    const handleActivityFilterConfirm = (activityIds, groupIds) => updateFilters({ activityIds, groupIds });
    const activityFilterCount = filters.activityIds.length + filters.groupIds.length;
    const mobilePanelLabel = composing
        ? (mobilePanelOpen ? 'Hide Associator' : 'Show Associator')
        : (mobilePanelOpen ? 'Hide Filters' : 'Show Filters');

    /* ─── Left column ─── */
    const leftColumn = (
        <div className={styles.leftColumn}>
            <PageHeader
                title="Notes"
                subtitle={isLoading && notes.length === 0 ? '…' : `${total} note${total !== 1 ? 's' : ''}`}
                actions={(
                    <>
                        <HeaderButton
                            variant="primary"
                            onClick={() => { setComposing(true); setIsFiltersPaneOpen(true); }}
                            disabled={composing}
                        >
                            + Write Note
                        </HeaderButton>
                        {!isMobile ? (
                            <HeaderButton variant="secondary" onClick={() => setIsFiltersPaneOpen(v => !v)}>
                                {isFiltersPaneOpen
                                    ? (composing ? 'Hide Associator' : 'Hide Filters')
                                    : (composing ? 'Show Associator' : 'Show Filters')}
                            </HeaderButton>
                        ) : null}
                    </>
                )}
            />

            {onboarding?.enabled && onboarding.state?.status === 'active' && !onboarding.state?.steps?.first_session && (
                <EmptyState compact className={styles.onboardingEmptyState} title="Notes preserve the context numbers miss" description="Complete a session, then capture what changed, what worked, and what to adjust next time." />
            )}

            {!composing && (
                <ActiveFiltersSummary
                    filters={filters}
                    savedFilters={savedFilters}
                    activeSavedIds={activeSavedIds}
                    onEdit={() => (isMobile ? setMobilePanelOpen(true) : setIsFiltersPaneOpen(true))}
                    onClear={clearAll}
                />
            )}

            <div className={styles.timelineArea}>
                {composing ? (
                    <NoteComposer
                        key={editingNote?.id || 'new'}
                        rootId={rootId}
                        onSubmit={handleCompose}
                        onCancel={() => {
                            setComposing(false);
                            setEditingNote(null);
                            setMobilePanelOpen(false);
                            resetComposeLinks();
                        }}
                        initialContent={editingNote?.content}
                        initialAttachments={editingNote?.attachments || []}
                        selectedGoalId={composeGoalId}
                        selectedGoalName={composeGoalName}
                        selectedActivityId={composeActivityId}
                        selectedActivityName={composeActivityName}
                        onGoalSelect={(id, name) => { setComposeGoalId(id); setComposeGoalName(name); }}
                        onActivitySelect={(id, name) => { setComposeActivityId(id); setComposeActivityName(name); }}
                        hideLinkPanel={true}
                        bare={!isMobile}
                        submitLabel={editingNote ? 'Save changes' : 'Save note'}
                    />
                ) : (
                    <NoteTimeline
                        notes={notes}
                        onEditRequest={handleEditRequest}
                        onDelete={deleteNote}
                        onPin={pinNote}
                        onUnpin={unpinNote}
                        showContext={true}
                        noteTypeVariant="metadata"
                        presentation="timeline"
                        groupByDate={true}
                        hasMore={hasMore}
                        onLoadMore={loadNextPage}
                        emptyMessage={hasActiveFilters ? 'No notes match the current filters.' : 'No notes yet. Write your first note!'}
                    />
                )}
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
                activityCount={activityFilterCount}
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

    const composeLinkPanelBody = (
        <div className={styles.composeLinkCardBody}>
            <ComposeLinkPanel
                rootId={rootId}
                selectedGoalId={composeGoalId}
                selectedActivityId={composeActivityId}
                onGoalSelect={(id, name) => { setComposeGoalId(id); setComposeGoalName(name); }}
                onActivitySelect={(id, name) => { setComposeActivityId(id); setComposeActivityName(name); }}
            />
        </div>
    );

    const composeLinkPanel = (
        <div className={styles.composeLinkCard}>
            <SidePaneHeader title="Link Note" subtitle="Goal or Activity" />
            {composeLinkPanelBody}
        </div>
    );

    const rightColumn = isFiltersPaneOpen && !isMobile && (
        <div className={styles.rightColumn}>
            {composing ? composeLinkPanel : filterPanel}
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

            <BodyPortal when={goalPickerOpen}>
                <GoalPickerModal
                    rootId={rootId}
                    selectedGoalId={filters.goalId}
                    onSelect={handleGoalFilterSelect}
                    onClose={() => setGoalPickerOpen(false)}
                />
            </BodyPortal>
            <BodyPortal when={activityPickerOpen}>
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={activities}
                    activityGroups={activityGroups}
                    initialActivityIds={filters.activityIds}
                    initialGroupIds={filters.groupIds}
                    onConfirm={handleActivityFilterConfirm}
                    onClose={() => setActivityPickerOpen(false)}
                />
            </BodyPortal>

            <NotesMobileSheet
                open={isMobile && mobilePanelOpen}
                composing={composing}
                total={total}
                hasActiveFilters={hasActiveFilters}
                onReset={clearAll}
                onClose={() => setMobilePanelOpen(false)}
            >
                {composing ? composeLinkPanelBody : filterPanelBody}
            </NotesMobileSheet>
        </div>
    );
}

export default Notes;
