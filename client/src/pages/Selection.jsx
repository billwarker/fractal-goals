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

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading fractals...</div>;
    }

    return (
        <div className="fractal-selection-container">
            <h1 style={{ color: 'white', fontWeight: 300, marginBottom: '10px' }}>
                My Fractal Goals
            </h1>
            <p style={{ color: '#888' }}>Select a tree to focus on</p>

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
                            <h3 style={{ margin: '0 0 8px 0' }}>{fractal.name}</h3>

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
            />
        </div>
    );
}

export default Selection;
