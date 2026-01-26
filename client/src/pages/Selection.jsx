import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import { getTypeDisplayName } from '../utils/goalHelpers';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import GoalModal from '../components/modals/GoalModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AuthModal from '../components/modals/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import '../App.css';

/**
 * Selection Page - Fractal Goal Selection
 * Displays all root goals as cards and allows navigation to specific fractal views
 */
function Selection() {
    const navigate = useNavigate();
    const [fractals, setFractals] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    const { user, logout, isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            fetchFractals();
        } else {
            setFractals([]);
            setLoading(false);
        }
    }, [isAuthenticated]);

    const fetchFractals = async () => {
        try {
            setLoading(true);
            const res = await globalApi.getAllFractals();
            setFractals(res.data || []);
        } catch (err) {
            console.error("Failed to fetch fractals", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectRoot = (rootId) => {
        navigate(`/${rootId}/goals`);
    };

    const handleCreateSubmit = async (data) => {
        if (!isAuthenticated) {
            setAuthModalOpen(true);
            return;
        }
        try {
            await globalApi.createFractal(data);
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
        const hierarchy = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal'];
        for (const type of hierarchy) {
            if (fractals.some(f => f.type === type)) return type;
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
            {/* Top Center Display */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '60px',
                marginTop: '40px',
                position: 'relative'
            }}>
                {/* The Goal Node Circle */}
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
                    zIndex: 0,
                    transition: 'background-color 0.5s ease'
                }}>
                    <h1 style={{
                        color: headerTextColor,
                        fontWeight: 800,
                        fontSize: '28px',
                        margin: 0,
                        textShadow: isDarkText ? 'none' : '0 2px 10px rgba(0,0,0,0.8)',
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        zIndex: 1
                    }}>
                        FRACTAL GOALS
                    </h1>
                </div>

                {/* Profile Controls (Logged In Only) */}
                {isAuthenticated && (
                    <div style={{
                        marginTop: '30px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        zIndex: 10
                    }}>
                        <div style={{
                            fontSize: '12px',
                            color: '#888',
                            fontWeight: '800',
                            letterSpacing: '2px',
                            textTransform: 'uppercase'
                        }}>
                            Welcome, <span style={{ color: 'white' }}>{user?.username}</span>
                        </div>
                        <button
                            onClick={logout}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.2)',
                                padding: '6px 20px',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '800',
                                letterSpacing: '1.5px',
                                textTransform: 'uppercase',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                                e.target.style.background = 'rgba(255,255,255,0.1)';
                                e.target.style.borderColor = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.target.style.background = 'transparent';
                                e.target.style.borderColor = 'rgba(255,255,255,0.2)';
                            }}
                        >
                            LOGOUT
                        </button>
                    </div>
                )}

                {/* Login Link (Logged Out Only) */}
                {!isAuthenticated && (
                    <div
                        onClick={() => setAuthModalOpen(true)}
                        style={{
                            marginTop: '30px',
                            color: '#888',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            letterSpacing: '1.5px',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            transition: 'color 0.2s ease',
                            zIndex: 10
                        }}
                        onMouseOver={(e) => e.target.style.color = 'white'}
                        onMouseOut={(e) => e.target.style.color = '#888'}
                    >
                        LOG IN
                    </div>
                )}
            </div>

            {/* Fractal Grid */}
            <div className="fractal-selection-grid">
                {isAuthenticated && fractals.map(fractal => (
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
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                            <h3 style={{ margin: '0 0 8px 0' }}>{fractal.name}</h3>
                            <div style={{ fontSize: '12px', color: getGoalColor(fractal.type), textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
                                {getTypeDisplayName(fractal.type)}
                            </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: 'auto', width: '100%' }}>
                            <div>Created: {formatDate(fractal.created_at)}</div>
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

                {isAuthenticated && (
                    <div className="fractal-card add-fractal-card" onClick={() => setCreateModalOpen(true)}>
                        <div className="add-icon">+</div>
                        <h3>New Fractal</h3>
                    </div>
                )}
            </div>

            {/* Modals */}
            <GoalModal
                isOpen={isCreateModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onSubmit={handleCreateSubmit}
                parent={null}
            />
            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Fractal Tree?"
                message={`Are you sure you want to delete "${fractalToDelete?.name}"?`}
                requireMatchingText="delete"
            />
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setAuthModalOpen(false)}
            />
        </div>
    );
}

export default Selection;
