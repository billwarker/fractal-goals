/**
 * Notes Page — /fractal/:rootId/notes
 *
 * Two-column layout:
 * - Left: filter chips + reverse-chronological timeline + compose toggle
 * - Right: "Filter Notes" panel with Goal + Activity filter buttons (open modals)
 *
 * Mobile: single column; filter panel becomes bottom sheet.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NoteTimeline, NoteComposer } from '../components/notes';
import { ComposeLinkPanel } from '../components/notes/NoteComposer';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useNotesPageQuery } from '../hooks/useNotesPageQuery';
import { useFractalTree } from '../hooks/useGoalQueries';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import ActivityFilterModal from '../components/common/ActivityFilterModal';
import GoalTreePicker from '../components/common/GoalTreePicker';
import useIsMobile from '../hooks/useIsMobile';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import styles from './Notes.module.css';

const NOTE_TYPE_OPTIONS = [
    { value: 'fractal_note', label: 'Fractal Notes' },
    { value: 'goal_note', label: 'Goal Notes' },
    { value: 'program_note', label: 'Program Notes' },
    { value: 'session_note', label: 'Session Notes' },
    { value: 'activity_instance_note', label: 'Activity Notes' },
    { value: 'activity_set_note', label: 'Activity Set Notes' },
    { value: 'activity_definition_note', label: 'Activity Definition Notes' },
];

// ─── Goal Picker Modal ───────────────────────────────────────────────────────

function GoalPickerModal({ rootId, selectedGoalId, onSelect, onClose }) {
    const { data: treeData } = useFractalTree(rootId);
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalSheet} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <span className={styles.modalTitle}>Filter by Goal</span>
                    <button className={styles.modalClose} onClick={onClose}>×</button>
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
        </div>
    );
}

// ─── Main Notes Page ─────────────────────────────────────────────────────────

function Notes() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { activities = [] } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);

    // Filter state
    const [selectedNoteTypes, setSelectedNoteTypes] = useState([]);
    const [pinnedOnly, setPinnedOnly] = useState(false);
    const [filterGoalId, setFilterGoalId] = useState(null);
    const [filterGoalName, setFilterGoalName] = useState('');
    const [filterActivityIds, setFilterActivityIds] = useState([]);
    const [filterGroupIds, setFilterGroupIds] = useState([]);
    const [search, setSearch] = useState('');

    // UI state
    const filtersPaneStorageKey = `notes-filter-pane-open:${rootId || 'default'}`;
    const [isFiltersPaneOpen, setIsFiltersPaneOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = window.localStorage.getItem(`notes-filter-pane-open:${rootId || 'default'}`);
        return stored === null ? true : stored === 'true';
    });
    const [composing, setComposing] = useState(false);
    const [editingNote, setEditingNote] = useState(null); // note object being edited
    const [goalPickerOpen, setGoalPickerOpen] = useState(false);
    const [activityPickerOpen, setActivityPickerOpen] = useState(false);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

    useEffect(() => {
        window.localStorage.setItem(filtersPaneStorageKey, String(isFiltersPaneOpen));
    }, [filtersPaneStorageKey, isFiltersPaneOpen]);

    // Compose link state
    const [composeGoalId, setComposeGoalId] = useState(null);
    const [composeGoalName, setComposeGoalName] = useState(null);
    const [composeActivityId, setComposeActivityId] = useState(null);
    const [composeActivityName, setComposeActivityName] = useState(null);

    const filters = {
        note_types: selectedNoteTypes.length ? selectedNoteTypes : undefined,
        goal_id: filterGoalId || undefined,
        activity_definition_ids: filterActivityIds.length ? filterActivityIds : undefined,
        activity_group_ids: filterGroupIds.length ? filterGroupIds : undefined,
        pinned_only: pinnedOnly || undefined,
        search: search || undefined,
    };

    const {
        notes, total, hasMore, isLoading,
        loadNextPage, createNote, updateNote, deleteNote, pinNote, unpinNote,
    } = useNotesPageQuery(rootId, filters);

    useEffect(() => { if (!rootId) navigate('/'); }, [rootId, navigate]);

    const toggleNoteType = (noteType) => {
        setSelectedNoteTypes(prev =>
            prev.includes(noteType) ? prev.filter(x => x !== noteType) : [...prev, noteType]
        );
    };

    const resetComposeLinks = () => {
        setComposeGoalId(null);
        setComposeGoalName(null);
        setComposeActivityId(null);
        setComposeActivityName(null);
    };

    const handleCompose = async (content, goalId, activityDefinitionId) => {
        if (editingNote) {
            await updateNote(editingNote.id, content);
            setEditingNote(null);
        } else {
            const contextType = goalId ? 'goal' : activityDefinitionId ? 'activity_definition' : 'root';
            const contextId = goalId || activityDefinitionId || rootId;
            await createNote({
                content,
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

    const handleGoalFilterSelect = (id, name) => {
        setFilterGoalId(id);
        setFilterGoalName(name || '');
    };

    const handleActivityFilterConfirm = (activityIds, groupIds) => {
        setFilterActivityIds(activityIds);
        setFilterGroupIds(groupIds);
    };

    const clearFilters = () => {
        setSelectedNoteTypes([]);
        setPinnedOnly(false);
        setFilterGoalId(null);
        setFilterGoalName('');
        setFilterActivityIds([]);
        setFilterGroupIds([]);
        setSearch('');
    };

    const hasActiveFilters = selectedNoteTypes.length > 0 || pinnedOnly || filterGoalId ||
        filterActivityIds.length > 0 || filterGroupIds.length > 0 || search;

    const activityFilterCount = filterActivityIds.length + filterGroupIds.length;
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
                        <button
                            className={`${headerStyles.actionButton} ${headerStyles.primaryActionButton}`}
                            onClick={() => { setComposing(true); setIsFiltersPaneOpen(true); }}
                            disabled={composing}
                        >
                            + Write Note
                        </button>
                        {isMobile ? (
                            <button
                                className={`${headerStyles.actionButton} ${headerStyles.secondaryActionButton}`}
                                onClick={() => setMobilePanelOpen((value) => !value)}
                            >
                                {mobilePanelLabel}
                            </button>
                        ) : (
                            <button
                                className={`${headerStyles.actionButton} ${headerStyles.secondaryActionButton}`}
                                onClick={() => setIsFiltersPaneOpen(v => !v)}
                            >
                                {isFiltersPaneOpen
                                    ? (composing ? 'Hide Associator' : 'Hide Filters')
                                    : (composing ? 'Show Associator' : 'Show Filters')}
                            </button>
                        )}
                    </>
                )}
            />

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
            {/* Search */}
            <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}><h4>Search</h4></div>
                <input
                    className={styles.searchInput}
                    placeholder="Search notes…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    type="text"
                />
            </div>

            {/* Note Type */}
            <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}><h4>Note Type</h4></div>
                <div className={styles.chipGroup}>
                    {NOTE_TYPE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={[styles.chip, selectedNoteTypes.includes(opt.value) ? styles.chipActive : ''].filter(Boolean).join(' ')}
                            onClick={() => toggleNoteType(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Pinned */}
            <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}><h4>Pinned</h4></div>
                <div className={styles.chipGroup}>
                    <button
                        className={[styles.chip, !pinnedOnly ? styles.chipActive : ''].filter(Boolean).join(' ')}
                        onClick={() => setPinnedOnly(false)}
                    >
                        All
                    </button>
                    <button
                        className={[styles.chip, pinnedOnly ? styles.chipActive : ''].filter(Boolean).join(' ')}
                        onClick={() => setPinnedOnly(true)}
                    >
                        Pinned only
                    </button>
                </div>
            </div>

            {/* Goal */}
            <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}><h4>Goal</h4></div>
                <button className={styles.pickerButton} onClick={() => setGoalPickerOpen(true)}>
                    {filterGoalName || 'Select a goal…'}
                    <span className={styles.pickerButtonArrow}>›</span>
                </button>
                {filterGoalId && (
                    <div className={styles.pickerSelection}>
                        <span>{filterGoalName}</span>
                        <button onClick={() => handleGoalFilterSelect(null, null)}>Clear</button>
                    </div>
                )}
            </div>

            {/* Activity */}
            <div className={styles.filterSection}>
                <div className={styles.filterSectionHeader}><h4>Activity</h4></div>
                <button className={styles.pickerButton} onClick={() => setActivityPickerOpen(true)}>
                    {activityFilterCount > 0 ? `${activityFilterCount} selected` : 'Select activities…'}
                    <span className={styles.pickerButtonArrow}>›</span>
                </button>
                {activityFilterCount > 0 && (
                    <div className={styles.pickerSelection}>
                        <span>{activityFilterCount} activit{activityFilterCount === 1 ? 'y' : 'ies/groups'} selected</span>
                        <button onClick={() => { setFilterActivityIds([]); setFilterGroupIds([]); }}>Clear</button>
                    </div>
                )}
            </div>
        </div>
    );

    /* ─── Right column filter panel ─── */
    const filterPanel = (
        <div className={styles.filterPanel}>
            <div className={styles.filterPanelHeader}>
                <div>
                    <div className={styles.filterPanelTitle}>Filters</div>
                    <div className={styles.filterPanelSubtitle}>
                        {isLoading ? '…' : `${total} note${total !== 1 ? 's' : ''} shown`}
                    </div>
                </div>
                <button
                    className={styles.resetFiltersBtn}
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                >
                    Reset Filters
                </button>
            </div>

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
            <div className={styles.filterPanelHeader}>
                <div>
                    <div className={styles.filterPanelTitle}>Link Note</div>
                    <div className={styles.filterPanelSubtitle}>Goal or Activity</div>
                </div>
            </div>
            {composeLinkPanelBody}
        </div>
    );

    const rightColumn = isFiltersPaneOpen && !isMobile && (
        <div className={styles.rightColumn}>
            {composing ? composeLinkPanel : filterPanel}
        </div>
    );

    return (
        <div className={styles.pageContainer}>
            {leftColumn}
            {rightColumn}

            {goalPickerOpen && (
                <GoalPickerModal
                    rootId={rootId}
                    selectedGoalId={filterGoalId}
                    onSelect={handleGoalFilterSelect}
                    onClose={() => setGoalPickerOpen(false)}
                />
            )}
            {activityPickerOpen && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={activities}
                    activityGroups={activityGroups}
                    initialActivityIds={filterActivityIds}
                    initialGroupIds={filterGroupIds}
                    onConfirm={handleActivityFilterConfirm}
                    onClose={() => setActivityPickerOpen(false)}
                />
            )}

            {isMobile && mobilePanelOpen && (
                <div className={styles.bottomSheet} onClick={() => setMobilePanelOpen(false)}>
                    <div className={styles.bottomSheetCard} onClick={e => e.stopPropagation()}>
                        <div className={styles.bottomSheetHandle} />
                        <div className={styles.bottomSheetHeader}>
                            <div className={styles.bottomSheetHeaderCopy}>
                                <div className={styles.bottomSheetTitle}>
                                    {composing ? 'Associator' : 'Filters'}
                                </div>
                                <div className={styles.bottomSheetSubtitle}>
                                    {composing ? 'Link this note to a goal or activity.' : `${total} note${total !== 1 ? 's' : ''} shown`}
                                </div>
                            </div>
                            <div className={styles.bottomSheetActions}>
                                {!composing ? (
                                    <button
                                        className={styles.bottomSheetActionButton}
                                        onClick={clearFilters}
                                        disabled={!hasActiveFilters}
                                    >
                                        Reset
                                    </button>
                                ) : null}
                                <button
                                    className={styles.bottomSheetActionButton}
                                    onClick={() => setMobilePanelOpen(false)}
                                >
                                    Hide
                                </button>
                            </div>
                        </div>
                        <div className={styles.bottomSheetBody}>
                            {composing ? composeLinkPanelBody : filterPanelBody}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Notes;
