import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActivities } from '../contexts/ActivitiesContext';
import { useSessions } from '../contexts/SessionsContext';
import ActivityBuilder from '../components/ActivityBuilder';
import ActivityCard from '../components/ActivityCard';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import '../App.css';

/**
 * Manage Activities Page - Grid view of activity tiles with modal builder
 */
function ManageActivities() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { activities, fetchActivities, createActivity, deleteActivity, loading, error: contextError } = useActivities();
    const { sessions, fetchSessions } = useSessions();

    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchActivities(rootId);
        fetchSessions(rootId);
    }, [rootId, navigate, fetchActivities, fetchSessions]);

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

            {error && (
                <div style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', color: '#f44336', margin: '0 40px 20px 40px', borderRadius: '4px' }}>
                    {error}
                </div>
            )}

            {/* Activities Grid */}
            <div style={{ padding: '0 40px 40px 40px' }}>
                {activities.length === 0 ? (
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
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Create Your First Activity
                        </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '20px'
                    }}>
                        {activities.map(activity => (
                            <ActivityCard
                                key={activity.id}
                                activity={activity}
                                lastInstantiated={getLastInstantiated(activity.id)}
                                onEdit={() => handleEditClick(activity)}
                                onDuplicate={() => handleDuplicate(activity)}
                                onDelete={() => handleDeleteClick(activity)}
                                isCreating={creating}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Activity Builder Modal */}
            <ActivityBuilder
                isOpen={showBuilder}
                onClose={handleBuilderClose}
                editingActivity={editingActivity}
                rootId={rootId}
                onSave={handleBuilderSave}
            />

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!activityToDelete}
                onClose={() => setActivityToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Activity?"
                message={`Are you sure you want to delete "${activityToDelete?.name}"?`}
            />
        </div>
    );
}

export default ManageActivities;
