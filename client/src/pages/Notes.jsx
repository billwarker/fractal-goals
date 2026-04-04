/**
 * Notes Page — /fractal/:rootId/notes
 *
 * Two-column layout:
 * - Left: filter chips + reverse-chronological timeline + compose toggle
 * - Right: "Filter Notes" panel with Goal + Activity filter buttons (open modals)
 *
 * Mobile: single column; filter panel becomes bottom sheet.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { NoteTimeline, NoteComposer } from '../components/notes';
import { ComposeLinkPanel } from '../components/notes/NoteComposer';
import { useNotesPageQuery } from '../hooks/useNotesPageQuery';
import { useFractalTree } from '../hooks/useGoalQueries';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import GoalTreePicker from '../components/common/GoalTreePicker';
import { queryKeys } from '../hooks/queryKeys';
import { fractalApi } from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import styles from './Notes.module.css';

const CONTEXT_TYPE_OPTIONS = [
    { value: 'root', label: 'Fractal Notes' },
    { value: 'goal', label: 'Goal Notes' },
    { value: 'session', label: 'Session Notes' },
    { value: 'activity_instance', label: 'Activity Notes' },
    { value: 'activity_definition', label: 'Activity Definition Notes' },
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
                        showHideMicroNano={true}
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

// ─── Activity Filter Modal ───────────────────────────────────────────────────

function ActivityFilterModal({ rootId, initialActivityIds = [], initialGroupIds = [], onConfirm, onClose }) {
    const { data: activities = [] } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => { const res = await fractalApi.getActivities(rootId); return res.data || []; },
        enabled: Boolean(rootId),
    });
    const { data: activityGroups = [] } = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => { const res = await fractalApi.getActivityGroups(rootId); return res.data || []; },
        enabled: Boolean(rootId),
    });

    const [pendingActivityIds, setPendingActivityIds] = useState(new Set(initialActivityIds));
    const [pendingGroupIds, setPendingGroupIds] = useState(new Set(initialGroupIds));
    const [browseGroupId, setBrowseGroupId] = useState(null); // null = top level

    // Build maps
    const groupMap = useMemo(() => {
        const m = {};
        activityGroups.forEach(g => { m[g.id] = g; });
        return m;
    }, [activityGroups]);

    const childGroupsByParent = useMemo(() => {
        const m = {};
        activityGroups.forEach(g => {
            const pid = g.parent_id || '__root__';
            if (!m[pid]) m[pid] = [];
            m[pid].push(g);
        });
        return m;
    }, [activityGroups]);

    const activitiesByGroup = useMemo(() => {
        const m = {};
        activities.forEach(a => {
            const gid = a.group_id || '__ungrouped__';
            if (!m[gid]) m[gid] = [];
            m[gid].push(a);
        });
        return m;
    }, [activities]);

    const topLevelGroups = childGroupsByParent['__root__'] || [];
    const currentGroup = browseGroupId ? groupMap[browseGroupId] : null;
    const currentSubGroups = childGroupsByParent[browseGroupId || '__root__'] || [];
    const currentActivities = activitiesByGroup[browseGroupId] || [];

    const totalSelected = pendingActivityIds.size + pendingGroupIds.size;

    const toggleGroup = (group) => {
        const newGroupIds = new Set(pendingGroupIds);
        const newActivityIds = new Set(pendingActivityIds);
        const groupActivities = activitiesByGroup[group.id] || [];

        if (newGroupIds.has(group.id)) {
            newGroupIds.delete(group.id);
            groupActivities.forEach(a => newActivityIds.delete(a.id));
        } else {
            newGroupIds.add(group.id);
            groupActivities.forEach(a => newActivityIds.add(a.id));
        }
        setPendingGroupIds(newGroupIds);
        setPendingActivityIds(newActivityIds);
    };

    const toggleActivity = (activity) => {
        const newIds = new Set(pendingActivityIds);
        if (newIds.has(activity.id)) {
            newIds.delete(activity.id);
        } else {
            newIds.add(activity.id);
        }
        setPendingActivityIds(newIds);
    };

    const handleClear = () => {
        setPendingActivityIds(new Set());
        setPendingGroupIds(new Set());
    };

    const handleApply = () => {
        onConfirm([...pendingActivityIds], [...pendingGroupIds]);
        onClose();
    };

    const handleBack = () => {
        if (browseGroupId) {
            const parent = groupMap[browseGroupId]?.parent_id || null;
            setBrowseGroupId(parent);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalSheet} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderLeft}>
                        {browseGroupId && (
                            <button className={styles.modalBackBtn} onClick={handleBack}>‹</button>
                        )}
                        <span className={styles.modalTitle}>
                            {currentGroup ? currentGroup.name : 'Filter by Activity'}
                        </span>
                    </div>
                    <button className={styles.modalClose} onClick={onClose}>×</button>
                </div>

                <div className={styles.activityModalBody}>
                    {/* Sub-groups */}
                    {currentSubGroups.length > 0 && (
                        <div className={styles.activityGroupGrid}>
                            {currentSubGroups.map(group => {
                                const hasChildren = (childGroupsByParent[group.id] || []).length > 0;
                                const actCount = (activitiesByGroup[group.id] || []).length;
                                const isChecked = pendingGroupIds.has(group.id);
                                return (
                                    <div
                                        key={group.id}
                                        className={[styles.activityGroupCard, isChecked ? styles.activityGroupCardChecked : ''].filter(Boolean).join(' ')}
                                    >
                                        <label className={styles.activityGroupCardCheckbox} onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleGroup(group)}
                                            />
                                        </label>
                                        <button
                                            className={styles.activityGroupCardName}
                                            onClick={() => setBrowseGroupId(group.id)}
                                        >
                                            {group.name}
                                            {hasChildren && <span className={styles.subgroupArrow}>›</span>}
                                            {!hasChildren && actCount > 0 && (
                                                <span className={styles.actCount}>{actCount}</span>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Activities in current group */}
                    {currentActivities.length > 0 && (
                        <div className={styles.activityCheckList}>
                            {currentSubGroups.length > 0 && (
                                <div className={styles.activityCheckListDivider}>Activities in this group</div>
                            )}
                            {currentActivities.map(activity => (
                                <label key={activity.id} className={styles.activityCheckRow}>
                                    <input
                                        type="checkbox"
                                        checked={pendingActivityIds.has(activity.id)}
                                        onChange={() => toggleActivity(activity)}
                                    />
                                    <span className={styles.activityCheckName}>{activity.name}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    {/* Ungrouped activities (only at root level) */}
                    {!browseGroupId && (activitiesByGroup['__ungrouped__'] || []).length > 0 && (
                        <div className={styles.activityCheckList}>
                            <div className={styles.activityCheckListDivider}>Ungrouped</div>
                            {(activitiesByGroup['__ungrouped__'] || []).map(activity => (
                                <label key={activity.id} className={styles.activityCheckRow}>
                                    <input
                                        type="checkbox"
                                        checked={pendingActivityIds.has(activity.id)}
                                        onChange={() => toggleActivity(activity)}
                                    />
                                    <span className={styles.activityCheckName}>{activity.name}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    {currentSubGroups.length === 0 && currentActivities.length === 0 && !browseGroupId && (
                        <span className={styles.modalEmpty}>No activities found.</span>
                    )}
                </div>

                <div className={styles.modalFooter}>
                    <span className={styles.modalFooterCount}>
                        {totalSelected > 0 ? `${totalSelected} selected` : 'None selected'}
                    </span>
                    <button className={styles.modalClearBtn} onClick={handleClear} disabled={totalSelected === 0}>
                        Clear
                    </button>
                    <button className={styles.modalApplyBtn} onClick={handleApply}>
                        Apply filters
                    </button>
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

    // Filter state
    const [selectedContextTypes, setSelectedContextTypes] = useState([]);
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
        context_types: selectedContextTypes.length ? selectedContextTypes : undefined,
        goal_id: filterGoalId || undefined,
        activity_definition_ids: filterActivityIds.length ? filterActivityIds : undefined,
        activity_group_ids: filterGroupIds.length ? filterGroupIds : undefined,
        pinned_only: pinnedOnly || undefined,
        search: search || undefined,
    };

    const {
        notes, total, hasMore, isLoading, isFetching,
        loadNextPage, createNote, updateNote, deleteNote, pinNote, unpinNote,
    } = useNotesPageQuery(rootId, filters);

    useEffect(() => { if (!rootId) navigate('/'); }, [rootId, navigate]);

    const toggleContextType = (ct) => {
        setSelectedContextTypes(prev =>
            prev.includes(ct) ? prev.filter(x => x !== ct) : [...prev, ct]
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
        setSelectedContextTypes([]);
        setPinnedOnly(false);
        setFilterGoalId(null);
        setFilterGoalName('');
        setFilterActivityIds([]);
        setFilterGroupIds([]);
        setSearch('');
    };

    const hasActiveFilters = selectedContextTypes.length > 0 || pinnedOnly || filterGoalId ||
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
                    {CONTEXT_TYPE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={[styles.chip, selectedContextTypes.includes(opt.value) ? styles.chipActive : ''].filter(Boolean).join(' ')}
                            onClick={() => toggleContextType(opt.value)}
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
                    rootId={rootId}
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
