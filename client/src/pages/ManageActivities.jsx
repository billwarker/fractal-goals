import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useSessions } from '../contexts/SessionsContext';
import ActivityBuilder from '../components/ActivityBuilder';
import ActivityCard from '../components/ActivityCard';

import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GroupBuilderModal from '../components/modals/GroupBuilderModal';
import styles from './ManageActivities.module.css'; // Import CSS Module

/**
 * Manage Activities Page - Grid view of activity tiles with modal builder
 */
function ManageActivities() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, createActivity, deleteActivity, loading, error: contextError,
        activityGroups, fetchActivityGroups, deleteActivityGroup, reorderActivityGroups } = useActivities();
    const { sessions, fetchSessions } = useSessions();

    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);

    // Group State
    const [showGroupBuilder, setShowGroupBuilder] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupToDelete, setGroupToDelete] = useState(null);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchActivities(rootId);
        fetchSessions(rootId);
        fetchActivityGroups(rootId);
    }, [rootId, navigate, fetchActivities, fetchSessions, fetchActivityGroups]);

    // Calculate last instantiated time for each activity
    const getLastInstantiated = (activityId) => {
        if (!sessions || sessions.length === 0) return null;

        // Find all sessions that use this activity
        const activitySessions = sessions.filter(session => {
            // Session data is in attributes.session_data
            const sessionData = session.attributes?.session_data;
            if (!sessionData || !sessionData.sections) return false;

            // Check all sections for exercises with this activity_id
            return sessionData.sections.some(section =>
                section.exercises?.some(exercise => exercise.activity_id === activityId)
            );
        });

        if (activitySessions.length === 0) return null;

        // Get the most recent session
        const mostRecent = activitySessions.reduce((latest, current) => {
            const currentStart = new Date(current.attributes?.session_start || current.attributes?.created_at);
            const latestStart = new Date(latest.attributes?.session_start || latest.attributes?.created_at);
            return currentStart > latestStart ? current : latest;
        });

        return mostRecent.attributes?.session_start || mostRecent.attributes?.created_at;
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

    const handleMoveGroupUp = async (index) => {
        if (index === 0) return;
        const newGroups = [...activityGroups];
        const temp = newGroups[index];
        newGroups[index] = newGroups[index - 1];
        newGroups[index - 1] = temp;

        const groupIds = newGroups.map(g => g.id);
        await reorderActivityGroups(rootId, groupIds);
    };

    const handleMoveGroupDown = async (index) => {
        if (index === activityGroups.length - 1) return;
        const newGroups = [...activityGroups];
        const temp = newGroups[index];
        newGroups[index] = newGroups[index + 1];
        newGroups[index + 1] = temp;

        const groupIds = newGroups.map(g => g.id);
        await reorderActivityGroups(rootId, groupIds);
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
        // Activities will auto-refresh via context
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
        try {
            setCreating(true);

            await createActivity(rootId, {
                name: `${activity.name} (Copy)`,
                description: activity.description || '',
                metrics: activity.metric_definitions?.map(m => ({
                    name: m.name,
                    unit: m.unit,
                    is_top_set_metric: m.is_top_set_metric || false,
                    is_multiplicative: m.is_multiplicative !== undefined ? m.is_multiplicative : true
                })) || [],
                splits: activity.split_definitions?.map(s => ({
                    name: s.name
                })) || [],
                has_sets: activity.has_sets,
                has_metrics: activity.has_metrics,
                metrics_multiplicative: activity.metrics_multiplicative,
                has_splits: activity.has_splits || false
            });

            setCreating(false);
        } catch (err) {
            console.error("Failed to duplicate activity", err);
            setError("Failed to duplicate activity");
            setCreating(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading activities...</div>;
    }

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

                {/* 1. Render Activity Groups */}
                {activityGroups && activityGroups.map((group, index) => {
                    // Filter activities in this group
                    const groupActivities = activities.filter(a => a.group_id === group.id);

                    return (
                        <div key={group.id} className={styles.groupContainer}>
                            <div className={styles.groupHeader}>
                                <div>
                                    <h2 className={styles.groupTitle}>
                                        {group.name}
                                    </h2>
                                    {group.description && (
                                        <p className={styles.groupDescription}>
                                            {group.description}
                                        </p>
                                    )}
                                </div>
                                <div className={styles.groupActions}>
                                    <div className={styles.moveButtons}>
                                        <button
                                            onClick={() => handleMoveGroupUp(index)}
                                            disabled={index === 0}
                                            className={styles.moveBtn}
                                            style={{
                                                color: index === 0 ? '#444' : '#888',
                                            }}
                                            title="Move Up"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            onClick={() => handleMoveGroupDown(index)}
                                            disabled={index === activityGroups.length - 1}
                                            className={styles.moveBtn}
                                            style={{
                                                color: index === activityGroups.length - 1 ? '#444' : '#888',
                                            }}
                                            title="Move Down"
                                        >
                                            ↓
                                        </button>
                                    </div>
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

                            {groupActivities.length > 0 ? (
                                <div className={styles.grid}>
                                    {groupActivities.map(activity => (
                                        <ActivityCard
                                            key={activity.id}
                                            activity={activity}
                                            lastInstantiated={getLastInstantiated(activity.id)}
                                            onEdit={handleEditClick}
                                            onDuplicate={handleDuplicate}
                                            onDelete={handleDeleteClick}
                                            isCreating={creating}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className={styles.emptyGroupState}>
                                    No activities in this group
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 2. Render Ungrouped Activities */}
                {activities.some(a => !a.group_id) && (
                    <div className={`${styles.ungroupedSection} ${activityGroups?.length === 0 ? styles.noGroups : ''}`}>
                        {activityGroups?.length > 0 && (
                            <h3 className={styles.ungroupedTitle}>
                                Ungrouped Activities
                            </h3>
                        )}
                        <div className={styles.grid}>
                            {activities.filter(a => !a.group_id).map(activity => (
                                <ActivityCard
                                    key={activity.id}
                                    activity={activity}
                                    lastInstantiated={getLastInstantiated(activity.id)}
                                    onEdit={handleEditClick}
                                    onDuplicate={handleDuplicate}
                                    onDelete={handleDeleteClick}
                                    isCreating={creating}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State (No activities and no groups) */}
                {activities.length === 0 && (!activityGroups || activityGroups.length === 0) && (
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
                message={`Are you sure you want to delete "${groupToDelete?.name}"? Activities in this group will not be deleted but will become ungrouped.`}
                confirmText="Delete Group"
            />
        </div>
    );
}

export default ManageActivities;

