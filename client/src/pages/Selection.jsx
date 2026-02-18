import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import { getTypeDisplayName } from '../utils/goalHelpers';
import GoalModal from '../components/modals/GoalModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AuthModal from '../components/modals/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import styles from './Selection.module.css'; // Import CSS Module
import { useTheme } from '../contexts/ThemeContext';
import useIsMobile from '../hooks/useIsMobile';

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
    const { getGoalColor, getGoalTextColor, getGoalSecondaryColor } = useTheme();
    const isMobile = useIsMobile();

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

    const getHighestPriorityRoot = () => {
        if (!fractals || fractals.length === 0) return null;

        const hierarchy = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal'];

        // Group by type
        const grouped = {};
        fractals.forEach(f => {
            if (!grouped[f.type]) grouped[f.type] = [];
            grouped[f.type].push(f);
        });

        // Find highest level existing type
        for (const type of hierarchy) {
            if (grouped[type] && grouped[type].length > 0) {
                // Found the highest level. 
                // Prioritize SMART goals within this level.
                const smartGoal = grouped[type].find(f => f.is_smart);
                if (smartGoal) return smartGoal;

                // If no SMART goal, return the first one (or could sort by creation, etc.)
                return grouped[type][0];
            }
        }

        // Fallback
        return fractals[0];
    };

    const topRoot = getHighestPriorityRoot();
    const headerType = topRoot ? topRoot.type : 'UltimateGoal';
    const isHeaderSmart = topRoot ? topRoot.is_smart : false;

    console.log('[Selection Logic Debug]', {
        fractalsCount: fractals ? fractals.length : 0,
        topRootName: topRoot ? topRoot.name : 'None',
        topRootType: topRoot ? topRoot.type : 'None',
        types: fractals ? fractals.map(f => `${f.name} (${f.type})`) : [],
        isHeaderSmart
    });

    const headerColor = getGoalColor(headerType);
    console.log('[Selection Logic Debug] headerColor:', headerColor);

    const headerSecondaryColor = getGoalSecondaryColor(headerType);
    const headerTextColor = getGoalTextColor(headerType);
    const isDarkText = headerTextColor === '#1a1a1a';
    const smartBorderWidth = isMobile ? 16 : 24;
    const smartMiddleSize = isMobile ? 130 : 186;
    const smartInnerSize = isMobile ? 64 : 94;

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
                        // SMART Goal: Secondary (Fill) with Primary Border
                        // Normal Goal: Primary (Fill) with App-BG Border (cutout effect)
                        backgroundColor: isHeaderSmart ? headerSecondaryColor : headerColor,
                        border: isHeaderSmart
                            ? `${smartBorderWidth}px solid ${headerColor}`
                            : `5px solid var(--color-bg-app)`, // Default cutout
                        boxShadow: isHeaderSmart ? 'none' : '0 0 50px rgba(0, 0, 0, 0.5)',
                        position: 'relative',
                        overflow: 'hidden', // Ensure content stays inside
                        boxSizing: 'border-box' // Explicitly set border-box to ensure visual math works
                    }}
                >
                    {/* SMART Goal Bullseye Layers */}
                    {isHeaderSmart && (
                        <>
                            {/* Middle Ring 
                                Scale: 186px / 280px ~ 66.4%
                                Border: 24px
                            */}
                            <div
                                style={{
                                    position: 'absolute',
                                    width: `${smartMiddleSize}px`,
                                    height: `${smartMiddleSize}px`,
                                    borderRadius: '50%',
                                    backgroundColor: headerSecondaryColor,
                                    border: `${smartBorderWidth}px solid ${headerColor}`,
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 0,
                                    boxSizing: 'border-box'
                                }}
                            />
                            {/* Inner Core 
                                Scale: 94px / 280px ~ 33.6%
                            */}
                            <div
                                style={{
                                    position: 'absolute',
                                    width: `${smartInnerSize}px`,
                                    height: `${smartInnerSize}px`,
                                    borderRadius: '50%',
                                    backgroundColor: headerColor,
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 0
                                }}
                            />
                        </>
                    )}

                    <h1
                        className={styles.title}
                        style={{
                            // Ensure text is visible on top of dark core
                            color: isHeaderSmart ? '#FFFFFF' : headerTextColor,
                            textShadow: isHeaderSmart ? '0 2px 10px rgba(0,0,0,0.8)' : (isDarkText ? 'none' : '0 2px 10px rgba(0,0,0,0.8)'),
                            fontSize: isHeaderSmart ? (isMobile ? '1.5rem' : '2.2rem') : (isMobile ? '1.5rem' : '28px'),
                            zIndex: 10, // Text on top
                            position: 'relative',
                            maxWidth: '90%',
                            lineHeight: 1.1,
                            fontWeight: 800
                        }}
                    >
                        FRACTAL GOALS
                    </h1>
                </div>

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
