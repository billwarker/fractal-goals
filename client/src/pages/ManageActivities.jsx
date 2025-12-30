import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useSessions } from '../contexts/SessionsContext';
import ActivityBuilder from '../components/ActivityBuilder';
import ActivityCard from '../components/ActivityCard';

import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GroupBuilderModal from '../components/modals/GroupBuilderModal';
import '../App.css';

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
        <div className="page-container" style={{ color: 'white' }}>
            {/* Header with Create Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '80px 40px 20px 40px', // Top padding to clear fixed nav
                borderBottom: '1px solid #333',
                marginBottom: '30px'
            }}>
                <h1 style={{ fontWeight: 300, margin: 0, fontSize: '28px' }}>
                    Manage Activities
                </h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={handleCreateGroup}
                        style={{
                            padding: '6px 16px',
                            background: 'transparent',
                            border: '1px dashed #666',
                            borderRadius: '4px',
                            color: '#aaa',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#aaa';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#666';
                            e.currentTarget.style.color = '#aaa';
                        }}
                    >
                        + Create Group
                    </button>
                    <button
                        onClick={handleCreateClick}
                        style={{
                            padding: '6px 16px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#444';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#333';
                            e.currentTarget.style.color = '#ccc';
                        }}
                    >
                        + Create Activity
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#f44336', margin: '0 40px 20px 40px', borderRadius: '4px' }}>
                    {error}
                </div>
            )}

            {/* Groups and Activities Render */}
            <div style={{ padding: '0 40px 40px 40px' }}>

                {/* 1. Render Activity Groups */}
                {activityGroups && activityGroups.map((group, index) => {
                    // Filter activities in this group
                    const groupActivities = activities.filter(a => a.group_id === group.id);

                    return (
                        <div key={group.id} style={{
                            marginBottom: '40px',
                            background: '#1a1a1a',
                            borderRadius: '12px',
                            border: '1px solid #333',
                            padding: '24px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 400, margin: '0 0 6px 0', color: '#fff' }}>
                                        {group.name}
                                    </h2>
                                    {group.description && (
                                        <p style={{ fontSize: '13px', color: '#888', margin: 0, maxWidth: '600px' }}>
                                            {group.description}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', marginRight: '8px' }}>
                                        <button
                                            onClick={() => handleMoveGroupUp(index)}
                                            disabled={index === 0}
                                            style={{
                                                background: 'transparent', border: 'none', color: index === 0 ? '#444' : '#888',
                                                cursor: index === 0 ? 'default' : 'pointer', fontSize: '18px', padding: '0 4px',
                                                display: 'flex', alignItems: 'center'
                                            }}
                                            title="Move Up"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            onClick={() => handleMoveGroupDown(index)}
                                            disabled={index === activityGroups.length - 1}
                                            style={{
                                                background: 'transparent', border: 'none', color: index === activityGroups.length - 1 ? '#444' : '#888',
                                                cursor: index === activityGroups.length - 1 ? 'default' : 'pointer', fontSize: '18px', padding: '0 4px',
                                                display: 'flex', alignItems: 'center'
                                            }}
                                            title="Move Down"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleEditGroup(group)}
                                        style={{ padding: '6px 12px', background: '#333', border: 'none', borderRadius: '4px', color: '#ccc', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDeleteGroupClick(group)}
                                        style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #444', borderRadius: '4px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            {groupActivities.length > 0 ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                    gap: '20px'
                                }}>
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
                                <div style={{ padding: '30px', textAlign: 'center', color: '#555', border: '1px dashed #333', borderRadius: '8px' }}>
                                    No activities in this group
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 2. Render Ungrouped Activities */}
                {activities.some(a => !a.group_id) && (
                    <div style={{ marginTop: activityGroups?.length > 0 ? '40px' : '0' }}>
                        {activityGroups?.length > 0 && (
                            <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#666', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                Ungrouped Activities
                            </h3>
                        )}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: '20px'
                        }}>
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
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 20px',
                        background: '#1e1e1e',
                        border: '1px dashed #444',
                        borderRadius: '8px'
                    }}>
                        <p style={{ color: '#666', fontSize: '16px', marginBottom: '20px' }}>
                            No activities defined yet
                        </p>
                        <button
                            onClick={handleCreateClick}
                            style={{
                                padding: '12px 24px',
                                background: '#4caf50',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
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

