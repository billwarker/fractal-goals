import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import { getTypeDisplayName } from '../utils/goalHelpers';
import GoalModal from '../components/modals/GoalModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AuthModal from '../components/modals/AuthModal';
import GoalIcon from '../components/atoms/GoalIcon';
import { useAuth } from '../contexts/AuthContext';
import styles from './Selection.module.css'; // Import CSS Module
import { useTheme } from '../contexts/ThemeContext'
import { useGoalLevels } from '../contexts/GoalLevelsContext';;
import useIsMobile from '../hooks/useIsMobile';

/**
 * Selection Page - Fractal Goal Selection
 * Displays all root goals as cards and allows navigation to specific fractal views
 */
function Selection() {
    const RECENT_ROOT_STORAGE_KEY = 'fractal_recent_root_id';
    const navigate = useNavigate();
    const [fractals, setFractals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recentRootId, setRecentRootId] = useState(() => localStorage.getItem(RECENT_ROOT_STORAGE_KEY));
    const [recentGoalLevels, setRecentGoalLevels] = useState([]);
    const [goalLevelsByRootId, setGoalLevelsByRootId] = useState({});

    // Modal States
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
    const { getGoalColor, getGoalTextColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();;
    const isMobile = useIsMobile();

    useEffect(() => {
        if (authLoading) return;
        if (isAuthenticated) {
            fetchFractals();
        } else {
            setFractals([]);
            setLoading(false);
            setRecentGoalLevels([]);
            setGoalLevelsByRootId({});
        }
    }, [isAuthenticated, authLoading]);

    useEffect(() => {
        setRecentRootId(localStorage.getItem(RECENT_ROOT_STORAGE_KEY));
    }, [fractals.length]);

    useEffect(() => {
        if (!isAuthenticated || !recentRootId) {
            setRecentGoalLevels([]);
            return;
        }
        let cancelled = false;
        const fetchRecentLevels = async () => {
            try {
                const res = await globalApi.getGoalLevels(recentRootId);
                if (!cancelled) setRecentGoalLevels(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                if (!cancelled) setRecentGoalLevels([]);
                console.error('Failed to fetch recent fractal goal levels', err);
            }
        };
        fetchRecentLevels();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, recentRootId]);

    useEffect(() => {
        if (!isAuthenticated || !Array.isArray(fractals) || fractals.length === 0) {
            setGoalLevelsByRootId({});
            return;
        }

        let cancelled = false;
        const fetchLevelColorsByRoot = async () => {
            try {
                const entries = await Promise.all(
                    fractals.map(async (fractal) => {
                        const res = await globalApi.getGoalLevels(fractal.id);
                        return [fractal.id, Array.isArray(res.data) ? res.data : []];
                    })
                );
                if (!cancelled) {
                    setGoalLevelsByRootId(Object.fromEntries(entries));
                }
            } catch (err) {
                if (!cancelled) setGoalLevelsByRootId({});
                console.error('Failed to fetch per-fractal goal levels', err);
            }
        };

        fetchLevelColorsByRoot();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, fractals]);

    useEffect(() => {
        if (isAuthenticated && isAuthModalOpen) {
            setAuthModalOpen(false);
        }
    }, [isAuthenticated, isAuthModalOpen]);

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
        localStorage.setItem(RECENT_ROOT_STORAGE_KEY, rootId);
        setRecentRootId(rootId);
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

    const getFractalLevelConfig = (fractal) => {
        const levels = goalLevelsByRootId[fractal.id];
        if (!Array.isArray(levels)) return null;

        const normalizedTypeName = fractal.type.replace(/([A-Z])/g, ' $1').trim();
        return levels.find((candidate) => (
            candidate?.name === normalizedTypeName || candidate?.name === fractal.type
        )) || null;
    };

    const getFractalTypeColor = (fractal) => {
        const level = getFractalLevelConfig(fractal);
        return level?.color || getGoalColor(fractal.type);
    };

    const getHighestPriorityRoot = () => {
        if (!fractals || fractals.length === 0) return null;
        const recentMatch = recentRootId
            ? fractals.find((fractal) => fractal.id === recentRootId)
            : null;
        if (recentMatch) return recentMatch;

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
    const normalizedHeaderName = headerType.replace(/([A-Z])/g, ' $1').trim();
    const recentLevel = recentGoalLevels.find((level) => (
        level?.name === normalizedHeaderName || level?.name === headerType
    ));

    console.log('[Selection Logic Debug]', {
        fractalsCount: fractals ? fractals.length : 0,
        topRootName: topRoot ? topRoot.name : 'None',
        topRootType: topRoot ? topRoot.type : 'None',
        types: fractals ? fractals.map(f => `${f.name} (${f.type})`) : [],
        isHeaderSmart
    });

    const headerColor = recentLevel?.color || getGoalColor(headerType);
    console.log('[Selection Logic Debug] headerColor:', headerColor);

    const headerSecondaryColor = recentLevel?.secondary_color || getGoalSecondaryColor(headerType);
    const headerShape = recentLevel?.icon || getGoalIcon(headerType) || 'circle';
    const headerTextColor = (() => {
        if (recentLevel?.color) {
            const hex = recentLevel.color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return yiq >= 128 ? '#1a1a1a' : '#FFFFFF';
        }
        return getGoalTextColor(headerType);
    })();
    const isDarkText = headerTextColor === '#1a1a1a';
    const headerLogoSize = isMobile ? 200 : 280;

    if (authLoading || loading) {
        return <div className={styles.loadingContainer}>Loading fractals...</div>;
    }

    return (
        <div className={styles.container}>
            {/* Top Center Display */}
            <div className={styles.headerContainer}>
                <div className={styles.headerLogoWrapper}>
                    <GoalIcon
                        shape={headerShape}
                        color={headerColor}
                        secondaryColor={headerSecondaryColor}
                        isSmart={isHeaderSmart}
                        size={headerLogoSize}
                    />
                    <h1
                        className={styles.titleOverlay}
                        style={{
                            color: isHeaderSmart ? '#FFFFFF' : headerTextColor,
                            textShadow: isHeaderSmart ? '0 2px 10px rgba(0,0,0,0.8)' : (isDarkText ? 'none' : '0 2px 10px rgba(0,0,0,0.8)'),
                            fontSize: isHeaderSmart ? (isMobile ? '1.5rem' : '2.2rem') : (isMobile ? '1.5rem' : '28px'),
                            zIndex: 10,
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
                    (() => {
                        const level = getFractalLevelConfig(fractal);
                        const fractalPrimaryColor = level?.color || getGoalColor(fractal.type);
                        const fractalSecondaryColor = level?.secondary_color || getGoalSecondaryColor(fractal.type);
                        const fractalShape = level?.icon || getGoalIcon(fractal.type) || 'circle';

                        return (
                            <div
                                key={fractal.id}
                                className={styles.card}
                                onClick={() => handleSelectRoot(fractal.id)}
                            >
                                <div className={styles.cardContent}>
                                    <h3 className={styles.cardTitle}>{fractal.name}</h3>
                                    <div
                                        className={styles.cardType}
                                        style={{ color: getFractalTypeColor(fractal) }}
                                    >
                                        {getTypeDisplayName(fractal.type)}
                                    </div>
                                    <div className={styles.cardTypeIcon}>
                                        <GoalIcon
                                            shape={fractalShape}
                                            color={fractalPrimaryColor}
                                            secondaryColor={fractalSecondaryColor}
                                            isSmart={Boolean(fractal.is_smart)}
                                            size={36}
                                        />
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
                        );
                    })()
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
