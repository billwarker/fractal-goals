import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import { getTypeDisplayName } from '../utils/goalHelpers';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import GoalModal from '../components/modals/GoalModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AuthModal from '../components/modals/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import styles from './Selection.module.css'; // Import CSS Module
import { useTheme } from '../contexts/ThemeContext';

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
    const { theme, toggleTheme } = useTheme();

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
        return <div className={styles.loadingContainer}>Loading fractals...</div>;
    }

    return (
        <div className={styles.container}>
            {/* Top Center Display */}
            <div className={styles.headerContainer}>
                {/* The Goal Node Circle */}
                <div
                    className={styles.goalNodeCircle}
                    style={{
                        backgroundColor: headerColor,
                    }}
                >
                    <h1
                        className={styles.title}
                        style={{
                            color: headerTextColor,
                            textShadow: isDarkText ? 'none' : '0 2px 10px rgba(0,0,0,0.8)',
                        }}
                    >
                        FRACTAL GOALS
                    </h1>
                </div>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className={styles.themeToggle}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>

                {/* Profile Controls (Logged In Only) */}
                {isAuthenticated && (
                    <div className={styles.profileContainer}>
                        <div className={styles.welcomeText}>
                            Welcome, <span className={styles.username}>{user?.username}</span>
                        </div>
                        <button
                            onClick={logout}
                            className={styles.logoutBtn}
                        >
                            LOGOUT
                        </button>
                    </div>
                )}

                {/* Login Link (Logged Out Only) */}
                {!isAuthenticated && (
                    <div
                        onClick={() => setAuthModalOpen(true)}
                        className={styles.loginLink}
                    >
                        LOG IN
                    </div>
                )}
            </div>

            {/* Fractal Grid */}
            <div className={styles.grid}>
                {isAuthenticated && fractals.map(fractal => (
                    <div
                        key={fractal.id}
                        className={styles.card}
                        onClick={() => handleSelectRoot(fractal.id)}
                    >
                        <div className={styles.cardContent}>
                            <h3 className={styles.cardTitle}>{fractal.name}</h3>
                            <div
                                className={styles.cardType}
                                style={{ color: getGoalColor(fractal.type) }}
                            >
                                {getTypeDisplayName(fractal.type)}
                            </div>
                        </div>
                        <div className={styles.cardFooter}>
                            <div>Created: {formatDate(fractal.created_at)}</div>
                        </div>
                        <button
                            className={styles.deleteBtn}
                            onClick={(e) => handleDeleteClick(e, fractal)}
                            title="Delete Fractal"
                        >
                            ×
                        </button>
                    </div>
                ))}

                {isAuthenticated && (
                    <div className={`${styles.card} ${styles.addCard}`} onClick={() => setCreateModalOpen(true)}>
                        <div className={styles.cardContent}>
                            <div className={styles.addIcon}>+</div>
                            <h3 className={styles.cardTitle}>New Fractal</h3>
                        </div>
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
