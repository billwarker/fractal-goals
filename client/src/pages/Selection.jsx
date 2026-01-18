import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import { getTypeDisplayName } from '../utils/goalHelpers';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import GoalModal from '../components/modals/GoalModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import '../App.css';

/**
 * Selection Page - Fractal Goal Selection
 * Displays all root goals as cards and allows navigation to specific fractal views
 */
function Selection() { // No props needed anymore
    const navigate = useNavigate();
    const [fractals, setFractals] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    useEffect(() => {
        fetchFractals();
    }, []);

    const fetchFractals = async () => {
        try {
            const res = await globalApi.getAllFractals();
            setFractals(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch fractals", err);
            setLoading(false);
        }
    };

    const handleSelectRoot = (rootId) => {
        navigate(`/${rootId}/goals`);
    };

    const handleCreateSubmit = async (data) => {
        try {
            await globalApi.createFractal(data);
            // Refresh list
            await fetchFractals();
            setCreateModalOpen(false);
        } catch (err) {
            alert('Failed to create fractal: ' + err.message);
        }
    };

    const handleDeleteClick = (e, fractal) => {
        e.stopPropagation();
        setFractalToDelete(fractal);
    };

    const handleConfirmDelete = async () => {
        if (!fractalToDelete) return;
        try {
            await globalApi.deleteFractal(fractalToDelete.id);
            // Optimistic update or refresh
            setFractals(current => current.filter(f => f.id !== fractalToDelete.id));
            setFractalToDelete(null);
        } catch (err) {
            alert('Failed to delete fractal: ' + err.message);
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getHighestLevelType = () => {
        if (!fractals || fractals.length === 0) return 'UltimateGoal';

        const hierarchy = [
            'UltimateGoal',
            'LongTermGoal',
            'MidTermGoal',
            'ShortTermGoal',
            'ImmediateGoal'
        ];

        for (const type of hierarchy) {
            if (fractals.some(f => f.type === type)) {
                return type;
            }
        }

        return 'UltimateGoal';
    };

    const headerType = getHighestLevelType();
    const headerColor = getGoalColor(headerType);
    const headerTextColor = getGoalTextColor(headerType);
    const isDarkText = headerTextColor === '#1a1a1a';

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading fractals...</div>;
    }

    return (
        <div className="fractal-selection-container">
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '60px',
                marginTop: '40px'
            }}>
                {/* The Goal Node Circle - Highest Level Color */}
                <div style={{
                    width: '280px',
                    height: '280px',
                    borderRadius: '50%',
                    backgroundColor: headerColor,
                    border: '5px solid white',
                    boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 0
                }}>
                    {/* The App Name */}
                    <h1 style={{
                        color: headerTextColor,
                        fontFamily: 'var(--font-family)',
                        fontWeight: 300,
                        fontSize: '32px',
                        margin: 0,
                        textShadow: isDarkText ? 'none' : '0 2px 10px rgba(0,0,0,0.8)',
                        letterSpacing: '3px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        zIndex: 1
                    }}>
                        Fractal Goals
                    </h1>
                </div>
            </div>

            <div className="fractal-selection-grid">
                {fractals.map(fractal => (
                    <div
                        key={fractal.id}
                        className="fractal-card"
                        onClick={() => handleSelectRoot(fractal.id)}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            textAlign: 'center'
                        }}
                    >
                        {/* Centered Content */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%'
                        }}>
                            <h3 style={{ margin: '0 0 8px 0', fontWeight: 300, letterSpacing: '0.05em', fontSize: '1.25rem' }}>{fractal.name}</h3>

                            {/* Type Badge */}
                            <div style={{
                                fontSize: '12px',
                                color: getGoalColor(fractal.type),
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontWeight: '500'
                            }}>
                                {getTypeDisplayName(fractal.type) || fractal.type || 'Unknown Type'}
                            </div>
                        </div>

                        {/* Timestamps at Bottom */}
                        <div style={{
                            fontSize: '11px',
                            color: '#666',
                            marginTop: 'auto',
                            width: '100%'
                        }}>
                            <div>Created: {formatDate(fractal.created_at)}</div>
                            {fractal.updated_at && fractal.updated_at !== fractal.created_at && (
                                <div>Updated: {formatDate(fractal.updated_at)}</div>
                            )}
                        </div>

                        <button
                            className="delete-btn"
                            onClick={(e) => handleDeleteClick(e, fractal)}
                            title="Delete Fractal"
                            style={{ position: 'absolute', top: '8px', right: '8px' }}
                        >
                            ×
                        </button>
                    </div>
                ))}

                <div className="fractal-card add-fractal-card" onClick={() => setCreateModalOpen(true)}>
                    <div className="add-icon">+</div>
                    <h3>New Fractal</h3>
                </div>
            </div>

            {/* Create Fractal Modal */}
            <GoalModal
                isOpen={isCreateModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onSubmit={handleCreateSubmit}
                parent={null} // Indicates creating a root
            />

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Fractal Tree?"
                message={`Are you sure you want to delete "${fractalToDelete?.name}"? This action cannot be undone.`}
                requireMatchingText="delete"
            />
        </div>
    );
}

export default Selection;
