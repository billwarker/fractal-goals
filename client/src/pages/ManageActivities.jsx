import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useSessions } from '../contexts/SessionsContext';
import ActivityBuilder from '../components/ActivityBuilder';
import ActivityCard from '../components/ActivityCard';

import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GroupBuilderModal from '../components/modals/GroupBuilderModal';
import Linkify from '../components/atoms/Linkify';
import { buildGroupReorderPayload, findLastInstantiatedForActivity } from '../utils/manageActivities';
import styles from './ManageActivities.module.css'; // Import CSS Module

/**
 * Manage Activities Page - Grid view of activity tiles with modal builder
 */
function ManageActivities() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, createActivity, updateActivity, deleteActivity, loading, error: contextError,
        activityGroups, fetchActivityGroups, deleteActivityGroup, reorderActivityGroups } = useActivities();
    const { useSessionsQuery } = useSessions();

    const { data: sessionsData } = useSessionsQuery(rootId);
    const sessions = sessionsData || [];

    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);

    // Group State
    const [showGroupBuilder, setShowGroupBuilder] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupToDelete, setGroupToDelete] = useState(null);

    // Collapsed state for groups (Set of group IDs)
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    // Drag-and-drop state
    const [draggingActivityId, setDraggingActivityId] = useState(null);
    const [dragOverGroupId, setDragOverGroupId] = useState(null);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchActivities(rootId);
        fetchActivityGroups(rootId);
    }, [rootId, navigate, fetchActivities, fetchActivityGroups]);

    // Calculate last instantiated time for each activity
    const getLastInstantiated = (activityId) => {
        return findLastInstantiatedForActivity(sessions, activityId);
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
            console.error("Failed to delete group", err);
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
            console.error('Failed to reorder activity groups', err);
            setError('Failed to reorder activity groups');
        }
    };

    const handleCreateClick = () => {
        setEditingActivity(null);
        setShowBuilder(true);
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
            console.error("Failed to delete activity", err);
            setError("Failed to delete activity");
            setActivityToDelete(null);
        }
    };

    const handleDuplicate = async (activity) => {
        // Create a copy of the activity data WITHOUT the ID to trigger "Create Mode" in Builder
        const copyData = {
            ...activity,
            id: undefined, // IMPORTANT: Undefined ID signals "Create New"
            name: `${activity.name} (Copy)`,
            // Ensure we deep copy arrays if needed to avoid reference bugs
            metric_definitions: activity.metric_definitions?.map(m => ({ ...m, id: undefined })),
            split_definitions: activity.split_definitions?.map(s => ({ ...s, id: undefined })),
            associated_goal_ids: activity.associated_goal_ids ? [...activity.associated_goal_ids] : []
        };

        setEditingActivity(copyData);
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
            await updateActivity(rootId, activityId, { group_id: normalizedTargetGroupId });
        } catch (err) {
            console.error('Failed to move activity:', err);
            console.error('Error response:', err.response?.data);
            setError('Failed to move activity to group');
        }

        setDraggingActivityId(null);
        setDragOverGroupId(null);
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading activities...</div>;
    }

    // Recursive Group Renderer
    const renderGroup = (group, level = 0) => {
        const isCollapsed = collapsedGroups.has(group.id);
        const isDragOver = dragOverGroupId === group.id;

        // Find children groups
        const childrenGroups = activityGroups.filter(g => g.parent_id === group.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        // Find activities in this group
        const groupActivities = Array.isArray(activities) ? activities.filter(a => a.group_id === group.id) : [];

        const isRoot = level === 0;

        return (
            <div
                key={group.id}
                className={`${styles.groupContainer} ${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
                style={{
                    marginBottom: '24px',
                    marginLeft: 0,
                    border: isRoot ? 'none' : '1px solid var(--color-border)',
                    borderLeft: `3px solid ${isRoot ? 'var(--color-border)' : 'var(--color-brand-primary)'}`,
                    backgroundColor: 'var(--color-bg-card-alt)',
                    padding: '20px 24px',
                    borderRadius: isRoot ? '0' : '8px'
                }}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.id)}
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

                        {/* Render Activities */}
                        {groupActivities.length > 0 ? (
                            <div className={styles.grid} onDragEnd={handleDragEnd}>
                                {groupActivities.map(activity => (
                                    <ActivityCard
                                        key={activity.id}
                                        activity={activity}
                                        lastInstantiated={getLastInstantiated(activity.id)}
                                        onEdit={handleEditClick}
                                        onDuplicate={handleDuplicate}
                                        onDelete={handleDeleteClick}
                                        isCreating={creating}
                                        onDragStart={handleDragStart}
                                        isDragging={draggingActivityId === activity.id}
                                    />
                                ))}
                            </div>
                        ) : (
                            childrenGroups.length === 0 && (
                                <div className={`${styles.emptyGroupState} ${styles.emptyGroupDropTarget}`} style={{ padding: '15px' }}>
                                    {isDragOver ? 'Drop activity here' : 'No activities in this group'}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>
        );
    };

    // Filter root groups
    const rootGroups = activityGroups
        .filter(g => !g.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return (
        <div className={`page-container ${styles.container}`}>
            {/* Header with Create Button */}
            <div className={styles.header}>
                <h1 className={styles.title}>
                    Manage Activities
                </h1>
                <div className={styles.headerActions}>
                    <button
                        onClick={handleCreateGroup}
                        className={styles.createGroupBtn}
                    >
                        + Create Group
                    </button>
                    <button
                        onClick={handleCreateClick}
                        className={styles.createActivityBtn}
                    >
                        + Create Activity
                    </button>
                </div>
            </div>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            {/* Groups and Activities Render */}
            <div className={styles.content}>

                {/* 1. Render Root Activity Groups (recursively renders children) */}
                {rootGroups.map(group => renderGroup(group))}

                {/* 2. Render Ungrouped Activities - also serves as drop zone */}
                <div
                    className={`${styles.ungroupedSection} ${rootGroups.length === 0 ? styles.noGroups : ''} ${styles.ungroupedDropZone} ${dragOverGroupId === 'ungrouped' ? styles.ungroupedDropZoneActive : ''}`}
                    onDragOver={(e) => handleDragOver(e, 'ungrouped')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, null)}
                >
                    {rootGroups.length > 0 && (
                        <h3 className={styles.ungroupedTitle}>
                            {dragOverGroupId === 'ungrouped' ? '📥 Drop here to ungroup' : 'Ungrouped Activities'}
                        </h3>
                    )}
                    <div className={styles.grid} onDragEnd={handleDragEnd}>
                        {(Array.isArray(activities) ? activities.filter(a => !a.group_id) : []).map(activity => (
                            <ActivityCard
                                key={activity.id}
                                activity={activity}
                                lastInstantiated={getLastInstantiated(activity.id)}
                                onEdit={handleEditClick}
                                onDuplicate={handleDuplicate}
                                onDelete={handleDeleteClick}
                                isCreating={creating}
                                onDragStart={handleDragStart}
                                isDragging={draggingActivityId === activity.id}
                            />
                        ))}
                    </div>
                    {(Array.isArray(activities) ? activities.filter(a => !a.group_id) : []).length === 0 && rootGroups.length > 0 && (
                        <div className={styles.emptyGroupState} style={{ padding: '15px', marginTop: '10px' }}>
                            {dragOverGroupId === 'ungrouped' ? 'Drop activity here to ungroup' : 'Drag activities here to ungroup'}
                        </div>
                    )}
                </div>

                {/* Empty State (No activities and no groups) */}
                {activities.length === 0 && rootGroups.length === 0 && (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyStateText}>
                            No activities defined yet
                        </p>
                        <button
                            onClick={handleCreateClick}
                            className={styles.createFirstBtn}
                        >
                            + Create Activity
                        </button>
                    </div>
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
                    fetchActivityGroups(rootId);
                    setShowGroupBuilder(false);
                }}
            />

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
        </div>
    );
}

export default ManageActivities;
