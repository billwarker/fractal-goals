import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useActivities as useActivitiesQuery, useActivityGroups } from '../hooks/useActivityQueries';
import { useActivityInstantiationSummary } from '../hooks/useSessionQueries';
import ActivityBuilder from '../components/ActivityBuilder';
import ActivityCard from '../components/ActivityCard';

import ManageMetricsModal from '../components/modals/ManageMetricsModal';

import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GroupBuilderModal from '../components/modals/GroupBuilderModal';
import { InboxIcon } from '../components/atoms/AppIcons';
import Linkify from '../components/atoms/Linkify';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import HeaderButton from '../components/layout/HeaderButton';
import { prepareActivityDefinitionCopy } from '../utils/activityBuilder';
import { buildGroupReorderPayload } from '../utils/manageActivities';
import styles from './ManageActivities.module.css'; // Import CSS Module
import { logError } from '../utils/logger';
import EmptyState from '../components/common/EmptyState';
import ViewToggleTabs from '../components/common/ViewToggleTabs';
import ActivityCatalogueToolbar from '../components/activities/ActivityCatalogueToolbar';
import ManageActivitiesCreateMenu from '../components/activities/ManageActivitiesCreateMenu';
import CircuitBuilderModal from '../components/circuits/CircuitBuilderModal';
import CircuitDefinitionCard from '../components/circuits/CircuitDefinitionCard';
import { useCircuits, useCircuitDefinitionMutations } from '../hooks/useCircuitQueries';
import useManageActivitiesCatalogue from '../hooks/useManageActivitiesCatalogue';


const CATALOGUE_VIEWS = [
    { value: 'activities', label: 'Activities' },
    { value: 'circuits', label: 'Activity Circuits' },
];

/**
 * Manage Activities Page - Grid view of activity tiles with modal builder
 */
function ManageActivities() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { updateActivity, deleteActivity, deleteActivityGroup, reorderActivityGroups } = useActivities();
    const { activities = [], isLoading: activitiesLoading } = useActivitiesQuery(rootId);
    const { activityGroups = [], isLoading: activityGroupsLoading } = useActivityGroups(rootId);
    const { data: circuits = [], isLoading: circuitsLoading } = useCircuits(rootId);
    const { createMutation: createCircuitMutation } = useCircuitDefinitionMutations(rootId);
    const { data: activityInstantiationSummary = {} } = useActivityInstantiationSummary(rootId);

    const [error, setError] = useState(null);
    const [catalogueView, setCatalogueView] = useState('activities');
    const [activityToDelete, setActivityToDelete] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);

    // Group State
    const [showGroupBuilder, setShowGroupBuilder] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupToDelete, setGroupToDelete] = useState(null);
    const [showMetricsModal, setShowMetricsModal] = useState(false);
    const [showCircuitBuilder, setShowCircuitBuilder] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Collapsed state for groups (Set of group IDs)
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    // Drag-and-drop state
    const [draggingActivityId, setDraggingActivityId] = useState(null);
    const [dragOverGroupId, setDragOverGroupId] = useState(null);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    const instantiationSummaryByActivity = useMemo(() => {
        return new Map(Object.entries(activityInstantiationSummary || {}));
    }, [activityInstantiationSummary]);

    const activeCatalogueItems = catalogueView === 'circuits' ? circuits : activities;
    const filteredCatalogue = useManageActivitiesCatalogue({
        items: activeCatalogueItems,
        activityGroups,
        searchTerm,
        includeEmptyGroups: catalogueView === 'activities',
    });

    const handleCatalogueViewChange = (nextView) => {
        setCatalogueView(nextView);
        setSearchTerm('');
        setDraggingActivityId(null);
        setDragOverGroupId(null);
    };

    // Group Handlers
    const handleCreateGroup = () => {
        setEditingGroup(null);
        setShowGroupBuilder(true);
    };

    const handleEditGroup = (group) => {
        setEditingGroup(group);
        setShowGroupBuilder(true);
    };

    const handleDeleteGroupClick = (group) => {
        setGroupToDelete(group);
    };

    const handleConfirmDeleteGroup = async () => {
        if (!groupToDelete) return;
        try {
            await deleteActivityGroup(rootId, groupToDelete.id);
            setGroupToDelete(null);
        } catch (err) {
            logError("Failed to delete group", err);
            setError("Failed to delete activity group");
        }
    };

    const toggleGroupCollapse = (groupId) => {
        const newCollapsed = new Set(collapsedGroups);
        if (newCollapsed.has(groupId)) {
            newCollapsed.delete(groupId);
        } else {
            newCollapsed.add(groupId);
        }
        setCollapsedGroups(newCollapsed);
    };

    const allGroupIds = useMemo(() => (
        (Array.isArray(activityGroups) ? activityGroups : []).map((group) => group.id)
    ), [activityGroups]);

    const allGroupsCollapsed = allGroupIds.length > 0 && allGroupIds.every((groupId) => collapsedGroups.has(groupId));

    const handleToggleCollapseAll = () => {
        if (allGroupsCollapsed) {
            setCollapsedGroups(new Set());
            return;
        }
        setCollapsedGroups(new Set(allGroupIds));
    };

    // Helper to get siblings for reordering
    const getSiblings = (group) => {
        return activityGroups.filter(g => g.parent_id === group.parent_id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    };

    const handleMoveGroup = async (group, direction) => {
        const orderedIds = buildGroupReorderPayload(activityGroups, group?.id, direction);
        if (!orderedIds) return;

        try {
            await reorderActivityGroups(rootId, orderedIds);
        } catch (err) {
            logError('Failed to reorder activity groups', err);
            setError('Failed to reorder activity groups');
        }
    };

    const handleCreateClick = () => {
        setEditingActivity(null);
        setShowBuilder(true);
    };

    const handleCreateCircuit = () => setShowCircuitBuilder(true);

    const handleCircuitBuilderSave = async (payload) => {
        try {
            await createCircuitMutation.mutateAsync(payload);
            setShowCircuitBuilder(false);
            setCatalogueView('circuits');
            setSearchTerm('');
        } catch (err) {
            logError('Failed to create activity circuit', err);
            setError(err?.response?.data?.error || 'Failed to create activity circuit');
        }
    };

    const handleEditClick = (activity) => {
        setEditingActivity(activity);
        setShowBuilder(true);
    };

    const handleBuilderClose = () => {
        setShowBuilder(false);
        setEditingActivity(null);
    };

    const handleBuilderSave = () => {
        setShowBuilder(false);
        setEditingActivity(null);
    };

    const handleDeleteClick = (activity) => {
        setActivityToDelete(activity);
    };

    const handleConfirmDelete = async () => {
        if (!activityToDelete) return;
        try {
            await deleteActivity(rootId, activityToDelete.id);
            setActivityToDelete(null);
        } catch (err) {
            logError("Failed to delete activity", err);
            setError("Failed to delete activity");
            setActivityToDelete(null);
        }
    };

    const handleDuplicate = async (activity) => {
        setEditingActivity(prepareActivityDefinitionCopy(activity));
        setShowBuilder(true);
    };

    // Drag-and-drop handlers
    const handleDragStart = (activityId) => {
        setDraggingActivityId(activityId);
    };

    const handleDragEnd = () => {
        setDraggingActivityId(null);
        setDragOverGroupId(null);
    };

    const handleDragOver = (e, groupId) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling to parent groups
        e.dataTransfer.dropEffect = 'move';
        if (dragOverGroupId !== groupId) {
            setDragOverGroupId(groupId);
        }
    };

    const handleDragLeave = (e) => {
        // Only clear if we're leaving the drop zone entirely
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverGroupId(null);
        }
    };

    const handleDrop = async (e, targetGroupId) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling to parent groups

        const activityId = e.dataTransfer.getData('activityId');
        if (!activityId) {
            return;
        }

        // Find the activity to check current group
        const activity = Array.isArray(activities) ? activities.find(a => a.id === activityId) : null;
        // Check if already in the target group (handle null for ungrouped)
        const currentGroupId = activity?.group_id || null;
        const normalizedTargetGroupId = targetGroupId || null;

        if (!activity || currentGroupId === normalizedTargetGroupId) {
            setDraggingActivityId(null);
            setDragOverGroupId(null);
            return;
        }

        try {
            const groupName = normalizedTargetGroupId
                ? (activityGroups.find((g) => g.id === normalizedTargetGroupId)?.name || 'Selected Group')
                : 'Ungrouped';
            await updateActivity(
                rootId,
                activityId,
                { group_id: normalizedTargetGroupId },
                { action: 'regroup', groupName }
            );
        } catch (err) {
            logError('Failed to move activity:', err);
            logError('Error response:', err.response?.data);
            setError('Failed to move activity to group');
        }

        setDraggingActivityId(null);
        setDragOverGroupId(null);
    };

    if (activitiesLoading || activityGroupsLoading || circuitsLoading) {
        return <div className={styles.loadingState}>Loading activities...</div>;
    }

    // Recursive Group Renderer
    const renderGroup = (group, level = 0) => {
        const isCollapsed = !filteredCatalogue.hasSearch && collapsedGroups.has(group.id);
        const isDragOver = dragOverGroupId === group.id;

        // Find children groups
        const childrenGroups = filteredCatalogue.groupChildrenMap.get(group.id) || [];

        const groupItems = filteredCatalogue.itemsByGroupMap.get(group.id) || [];

        const isRoot = level === 0;

        return (
            <div
                key={group.id}
                className={`${styles.groupContainer} ${catalogueView === 'activities' ? styles.dropZone : ''} ${isDragOver ? styles.dropZoneActive : ''}`}
                style={{
                    marginBottom: '24px',
                    marginLeft: 0,
                    border: isRoot ? 'none' : '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-card-alt)',
                    padding: '20px 24px',
                    borderRadius: isRoot ? '0' : '8px'
                }}
                onDragOver={catalogueView === 'activities' ? (e) => handleDragOver(e, group.id) : undefined}
                onDragLeave={catalogueView === 'activities' ? handleDragLeave : undefined}
                onDrop={catalogueView === 'activities' ? (e) => handleDrop(e, group.id) : undefined}
            >
                <div className={styles.groupHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => toggleGroupCollapse(group.id)}
                            className={styles.moveBtn}
                            style={{ fontSize: '14px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}
                        >
                            {isCollapsed ? '+' : '-'}
                        </button>
                        <div>
                            <h2 className={styles.groupTitle} style={{ fontSize: isRoot ? '20px' : '18px' }}>
                                {group.name}
                            </h2>
                            {group.description && (
                                <p className={styles.groupDescription}>
                                    <Linkify>{group.description}</Linkify>
                                </p>
                            )}
                        </div>
                    </div>

                    <div className={styles.groupActions}>
                        {/* Only show reorder for root groups for now to avoid complexity */}
                        {isRoot && (
                            <div className={styles.moveButtons}>
                                <button
                                    type="button"
                                    className={styles.moveBtn}
                                    onClick={() => handleMoveGroup(group, 'up')}
                                    disabled={getSiblings(group).findIndex(g => g.id === group.id) === 0}
                                    title="Move group up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className={styles.moveBtn}
                                    onClick={() => handleMoveGroup(group, 'down')}
                                    disabled={getSiblings(group).findIndex(g => g.id === group.id) === getSiblings(group).length - 1}
                                    title="Move group down"
                                >
                                    ↓
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => handleEditGroup(group)}
                            className={styles.editGroupBtn}
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => handleDeleteGroupClick(group)}
                            className={styles.deleteGroupBtn}
                        >
                            Delete
                        </button>
                    </div>
                </div>

                {!isCollapsed && (
                    <>
                        {/* Render Subgroups */}
                        {childrenGroups.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                {childrenGroups.map(child => renderGroup(child, level + 1))}
                            </div>
                        )}

                        {/* Render the active catalogue type */}
                        {groupItems.length > 0 ? (
                            <div className={styles.grid} onDragEnd={catalogueView === 'activities' ? handleDragEnd : undefined}>
                                {catalogueView === 'activities' ? groupItems.map((activity) => (
                                    <ActivityCard
                                        key={activity.id}
                                        activity={activity}
                                        instantiationSummary={instantiationSummaryByActivity.get(activity.id)}
                                        onEdit={handleEditClick}
                                        onDuplicate={handleDuplicate}
                                        onDelete={handleDeleteClick}
                                        onDragStart={handleDragStart}
                                        isDragging={draggingActivityId === activity.id}
                                    />
                                )) : groupItems.map((circuit) => (
                                    <CircuitDefinitionCard
                                        key={circuit.id}
                                        circuit={circuit}
                                        rootId={rootId}
                                        activities={activities}
                                        activityGroups={activityGroups}
                                        onError={setError}
                                    />
                                ))}
                            </div>
                        ) : (
                            childrenGroups.length === 0 && (
                                <div className={`${styles.emptyGroupState} ${styles.emptyGroupDropTarget}`} style={{ padding: '15px' }}>
                                    {isDragOver
                                        ? 'Drop activity here'
                                        : `No ${catalogueView === 'activities' ? 'activities' : 'activity circuits'} in this group`}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>
        );
    };

    // Filter root groups
    const rootGroups = filteredCatalogue.rootGroups;
    const ungroupedItems = filteredCatalogue.itemsByGroupMap.get('__ungrouped__') || [];
    const showUngroupedHeading = catalogueView === 'activities'
        ? rootGroups.length > 0
        : ungroupedItems.length > 0;
    const hasSearchResults = !filteredCatalogue.hasSearch
        || filteredCatalogue.resultCount > 0
        || ungroupedItems.length > 0;

    return (
        <div className={`${headerStyles.pageShell} ${styles.container}`}>
            <PageHeader
                title="Manage Activities"
                subtitle="Create, organize, and reuse activities and circuits across sessions and templates."
                actions={(
                    <>
                        <ViewToggleTabs
                            className={styles.viewToggle}
                            items={CATALOGUE_VIEWS}
                            value={catalogueView}
                            onChange={handleCatalogueViewChange}
                            ariaLabel="Manage activities view"
                        />
                        <ActivityCatalogueToolbar
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            placeholder={catalogueView === 'activities' ? 'Groups or activities' : 'Groups or activity circuits'}
                            hasGroups={allGroupIds.length > 0}
                            allGroupsCollapsed={allGroupsCollapsed}
                            onToggleCollapseAll={handleToggleCollapseAll}
                            controlClassName={styles.headerControl}
                        />
                        <HeaderButton className={styles.headerControl} variant="secondary" onClick={() => setShowMetricsModal(true)}>
                            Manage Metrics
                        </HeaderButton>
                        <ManageActivitiesCreateMenu
                            onCreateActivity={handleCreateClick}
                            onCreateGroup={handleCreateGroup}
                            onCreateCircuit={handleCreateCircuit}
                            triggerClassName={styles.headerControl}
                        />
                    </>
                )}
            />

            <div className={`${headerStyles.scrollContent} ${headerStyles.gridContent} ${styles.content}`}>
                {error && (
                    <div className={styles.errorMessage}>
                        {error}
                    </div>
                )}

                {/* Render root activity groups (recursively renders children). */}
                {rootGroups.map(group => renderGroup(group))}

                {/* Render the active type's ungrouped definitions. */}
                <div
                    className={`${styles.ungroupedSection} ${rootGroups.length === 0 ? styles.noGroups : ''} ${catalogueView === 'activities' ? styles.ungroupedDropZone : ''} ${dragOverGroupId === 'ungrouped' ? styles.ungroupedDropZoneActive : ''}`}
                    onDragOver={catalogueView === 'activities' ? (e) => handleDragOver(e, 'ungrouped') : undefined}
                    onDragLeave={catalogueView === 'activities' ? handleDragLeave : undefined}
                    onDrop={catalogueView === 'activities' ? (e) => handleDrop(e, null) : undefined}
                >
                    {showUngroupedHeading && (
                        <h3 className={styles.ungroupedTitle}>
                            {dragOverGroupId === 'ungrouped' ? (
                                <>
                                    <InboxIcon size={18} />
                                    <span>Drop here to ungroup</span>
                                </>
                            ) : `Ungrouped ${catalogueView === 'activities' ? 'Activities' : 'Activity Circuits'}`}
                        </h3>
                    )}
                    <div className={styles.grid} onDragEnd={catalogueView === 'activities' ? handleDragEnd : undefined}>
                        {catalogueView === 'activities' ? ungroupedItems.map((activity) => (
                            <ActivityCard
                                key={activity.id}
                                activity={activity}
                                instantiationSummary={instantiationSummaryByActivity.get(activity.id)}
                                onEdit={handleEditClick}
                                onDuplicate={handleDuplicate}
                                onDelete={handleDeleteClick}
                                onDragStart={handleDragStart}
                                isDragging={draggingActivityId === activity.id}
                            />
                        )) : ungroupedItems.map((circuit) => (
                            <CircuitDefinitionCard
                                key={circuit.id}
                                circuit={circuit}
                                rootId={rootId}
                                activities={activities}
                                activityGroups={activityGroups}
                                onError={setError}
                            />
                        ))}
                    </div>
                    {ungroupedItems.length === 0 && rootGroups.length > 0 && !filteredCatalogue.hasSearch && catalogueView === 'activities' && (
                        <div className={styles.emptyGroupState} style={{ padding: '15px', marginTop: '10px' }}>
                            {dragOverGroupId === 'ungrouped' ? 'Drop activity here to ungroup' : 'Drag activities here to ungroup'}
                        </div>
                    )}
                </div>

                {filteredCatalogue.hasSearch && !hasSearchResults && (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyStateText}>
                            No groups or {catalogueView === 'activities' ? 'activities' : 'activity circuits'} match "{searchTerm.trim()}"
                        </p>
                    </div>
                )}

                {/* Empty state for the active catalogue type. */}
                {!filteredCatalogue.hasSearch
                    && activeCatalogueItems.length === 0
                    && rootGroups.length === 0 && (
                    <EmptyState
                        title={catalogueView === 'activities'
                            ? 'Define the practice that moves a goal'
                            : 'Build your first activity circuit'}
                        description={catalogueView === 'activities'
                            ? 'Activities describe what you do. Add a metric when you want sessions to produce measurable evidence.'
                            : 'Activity circuits repeat an ordered sequence without double-counting activity time.'}
                        actionLabel={catalogueView === 'activities' ? 'Create your first activity' : 'Create your first activity circuit'}
                        onAction={catalogueView === 'activities' ? handleCreateClick : handleCreateCircuit}
                    />
                )}
            </div>

            {/* Modals */}
            <ActivityBuilder
                isOpen={showBuilder}
                onClose={handleBuilderClose}
                editingActivity={editingActivity}
                rootId={rootId}
                onSave={handleBuilderSave}
            />

            <GroupBuilderModal
                isOpen={showGroupBuilder}
                onClose={() => setShowGroupBuilder(false)}
                editingGroup={editingGroup}
                rootId={rootId}
                activityGroups={activityGroups} // Pass groups for parent selection
                onSave={() => {
                    setShowGroupBuilder(false);
                }}
            />

            {showCircuitBuilder && (
                <CircuitBuilderModal
                    isOpen
                    onClose={() => setShowCircuitBuilder(false)}
                    activities={activities}
                    activityGroups={activityGroups}
                    onSave={handleCircuitBuilderSave}
                    isSaving={createCircuitMutation.isPending}
                />
            )}

            <DeleteConfirmModal
                isOpen={!!activityToDelete}
                onClose={() => setActivityToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Activity"
                message={`Are you sure you want to delete "${activityToDelete?.name}"? This cannot be undone.`}
            />

            <DeleteConfirmModal
                isOpen={!!groupToDelete}
                onClose={() => setGroupToDelete(null)}
                onConfirm={handleConfirmDeleteGroup}
                title="Delete Activity Group"
                message={`Are you sure you want to delete "${groupToDelete?.name}"? Nested groups will be deleted. Activities will become ungrouped.`}
                confirmText="Delete Group"
            />

            <ManageMetricsModal
                isOpen={showMetricsModal}
                onClose={() => setShowMetricsModal(false)}
                rootId={rootId}
            />

        </div>
    );
}

export default ManageActivities;
