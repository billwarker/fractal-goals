import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useHeader } from '../../contexts/HeaderContext';
import { useAuth } from '../../contexts/AuthContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useRootGoal } from '../../hooks/useGoalQueries';
import useIsMobile from '../../hooks/useIsMobile';
import { queryKeys } from '../../hooks/queryKeys';
import { globalApi } from '../../utils/api';
import { getFractalDisplay, getFractalSwitchPath } from '../../utils/fractalNavigation';
import { dismissGoalDetailsForNavigation } from '../../utils/navigationEvents';
import GoalIcon from '../atoms/GoalIcon';
import NavigationSessionAction from './NavigationSessionAction';
import styles from '../../AppRouter.module.css';

function FractalSwitcher({
    rootId,
    rootGoal,
    isFractalRoute,
    isMobile,
    onSwitch,
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const goalLevels = useGoalLevels();
    const [openPath, setOpenPath] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);
    const switcherRef = useRef(null);
    const menuRef = useRef(null);
    const userId = user?.id || null;
    const isOpen = openPath === location.pathname;

    const fractalsQuery = useQuery({
        queryKey: queryKeys.fractals(userId),
        queryFn: async () => {
            const res = await globalApi.getAllFractals();
            return res.data || [];
        },
        enabled: Boolean(isFractalRoute && isAuthenticated && userId),
    });

    const fractals = useMemo(() => (
        Array.isArray(fractalsQuery.data) ? fractalsQuery.data : []
    ), [fractalsQuery.data]);
    const switchableFractals = useMemo(() => (
        fractals.filter((fractal) => fractal.id !== rootId)
    ), [fractals, rootId]);
    const currentFractal = fractals.find((fractal) => fractal.id === rootId) || null;
    const currentDisplay = getFractalDisplay(currentFractal, rootGoal, goalLevels);
    const menuId = `fractal-switcher-menu-${rootId}`;
    const updateMenuPosition = useCallback(() => {
        const trigger = switcherRef.current?.querySelector('button');
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        const edge = isMobile ? 12 : 16;
        const width = Math.min(420, Math.max(0, viewportWidth - (edge * 2)));
        const left = Math.min(Math.max(rect.left, edge), Math.max(edge, viewportWidth - width - edge));
        setMenuPosition({ left, top: rect.bottom + 8, width });
    }, [isMobile]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!switcherRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
                setOpenPath(null);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setOpenPath(null);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const viewport = window.visualViewport;
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);
        viewport?.addEventListener('resize', updateMenuPosition);
        viewport?.addEventListener('scroll', updateMenuPosition);
        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
            viewport?.removeEventListener('resize', updateMenuPosition);
            viewport?.removeEventListener('scroll', updateMenuPosition);
        };
    }, [isOpen, updateMenuPosition]);

    const handleSelectFractal = (nextRootId) => {
        if (!nextRootId || nextRootId === rootId) {
            setOpenPath(null);
            return;
        }

        onSwitch();
        navigate(getFractalSwitchPath(location.pathname, nextRootId));
    };

    return (
        <div className={`${styles.fractalSwitcher} ${isMobile ? styles.fractalSwitcherMobile : ''}`} ref={switcherRef}>
            <button
                type="button"
                className={styles.fractalSwitcherButton}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={menuId}
                aria-label={`Switch fractal. Current fractal: ${currentDisplay.name}`}
                onClick={() => setOpenPath((value) => {
                    if (value !== location.pathname) {
                        updateMenuPosition();
                        onSwitch();
                        return location.pathname;
                    }
                    return null;
                })}
            >
                {currentDisplay.type && (
                    <GoalIcon
                        shape={currentDisplay.shape}
                        color={currentDisplay.color}
                        secondaryColor={currentDisplay.secondaryColor}
                        isSmart={currentDisplay.isSmart}
                        size={isMobile ? 30 : 22}
                        className={styles.fractalTitleIcon}
                    />
                )}
                {!isMobile && (
                    <span className={`fractal-title ${styles.fractalTitle}`}>{currentDisplay.name}</span>
                )}
                <span className={styles.fractalSwitcherChevron} aria-hidden="true">▾</span>
            </button>

            {isOpen && menuPosition && createPortal(
                <div
                    className={`${styles.fractalSwitcherMenu} ${styles.fractalSwitcherMenuPortal}`}
                    id={menuId}
                    ref={menuRef}
                    role="menu"
                    aria-label="Available fractals"
                    style={menuPosition}
                >
                    {fractalsQuery.isLoading && (
                        <div className={styles.fractalSwitcherStatus}>Loading fractals...</div>
                    )}
                    {!fractalsQuery.isLoading && switchableFractals.length === 0 && (
                        <div className={styles.fractalSwitcherStatus}>No other fractals available</div>
                    )}
                    {!fractalsQuery.isLoading && switchableFractals.map((fractal) => {
                        const display = getFractalDisplay(fractal, null, goalLevels);
                        return (
                            <button
                                key={fractal.id}
                                type="button"
                                role="menuitem"
                                className={styles.fractalSwitcherItem}
                                onClick={() => handleSelectFractal(fractal.id)}
                            >
                                <GoalIcon
                                    shape={display.shape}
                                    color={display.color}
                                    secondaryColor={display.secondaryColor}
                                    isSmart={display.isSmart}
                                    size={22}
                                    className={styles.fractalSwitcherItemIcon}
                                />
                                <span className={`fractal-title ${styles.fractalTitle} ${styles.fractalSwitcherItemName}`}>
                                    {display.name}
                                </span>
                            </button>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}

// Navigation header component defined outside of App to avoid re-declaration
export const NavigationHeader = ({ onOpenSettings, onHeightChange }) => {
    const location = useLocation();
    const { headerActions } = useHeader();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const navRef = useRef(null);
    // Event logs are platform telemetry surfaced through the admin usage
    // dashboard; the Logs page is admin-only.
    const showLogsNav = Boolean(user?.is_admin);

    const pathParts = location.pathname.split('/');
    const rootId = pathParts[1]; // First part after /

    const isFractalRoute = Boolean(
        rootId &&
        !['', 'admin', 'assets', 'vite.svg', 'session', 'manage-activities', 'manage-session-templates', 'create-session', 'analytics', 'logs'].includes(rootId)
    );

    const { data: rootGoal } = useRootGoal(rootId, { enabled: isFractalRoute });
    useEffect(() => {
        if (typeof onHeightChange !== 'function') {
            return undefined;
        }

        const navElement = navRef.current;
        if (!navElement) {
            onHeightChange(0);
            return undefined;
        }

        const updateHeight = () => {
            onHeightChange(Math.ceil(navElement.getBoundingClientRect().height));
        };

        updateHeight();

        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(updateHeight);
            observer.observe(navElement);
            return () => {
                observer.disconnect();
                onHeightChange(0);
            };
        }

        window.addEventListener('resize', updateHeight);
        return () => {
            window.removeEventListener('resize', updateHeight);
            onHeightChange(0);
        };
    }, [headerActions, isMobile, location.pathname, onHeightChange]);

    // Only show nav if we're on a fractal page
    if (!rootId || rootId === '') return null;

    const primaryNavItems = [
        { path: `/${rootId}/goals`, label: 'GOALS' },
        { path: `/${rootId}/programs`, label: 'PROGRAMS' },
        { path: `/${rootId}/sessions`, label: 'SESSIONS' },
        { path: `/${rootId}/notes`, label: 'NOTES' },
        { path: `/${rootId}/analytics`, label: 'ANALYTICS' }
    ];
    const logsNavItem = { path: `/${rootId}/logs`, label: 'LOGS' };

    const isActive = (path) => location.pathname.startsWith(path);
    const handleRouteLinkClick = () => {
        dismissGoalDetailsForNavigation();
    };
    const handleOpenSettings = () => {
        dismissGoalDetailsForNavigation();
        onOpenSettings();
    };
    const handleSwitchFractal = () => {
        dismissGoalDetailsForNavigation();
    };

    if (isMobile) {
        return (
            <>
                <div className="top-nav-links" ref={navRef}>
                    <div className={styles.mobileNav}>
                        <FractalSwitcher
                            rootId={rootId}
                            rootGoal={rootGoal}
                            isFractalRoute={isFractalRoute}
                            isMobile
                            onSwitch={handleSwitchFractal}
                        />
                        <NavigationSessionAction rootId={rootId} userId={user?.id} isMobile onClick={handleRouteLinkClick} />
                        <nav className={styles.mobilePrimaryNav} aria-label="Primary">
                            {primaryNavItems.map(item => (
                                <Link key={item.path} to={item.path} aria-current={isActive(item.path) ? 'page' : undefined} className={isActive(item.path) ? styles.mobilePrimaryActive : ''} onClick={handleRouteLinkClick}>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                        <button className={`nav-text-link ${styles.mobileBtn}`} onClick={handleOpenSettings}>
                            SETTINGS
                        </button>
                        <Link className={`nav-text-link home-link ${styles.mobileBtn}`} to="/" onClick={handleRouteLinkClick}>
                            EXIT
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="top-nav-links" ref={navRef}>
            <div className="nav-group">
                {/* Left Side: Title and Primary Nav */}
                <div className={styles.navContainer}>
                    <FractalSwitcher
                        rootId={rootId}
                        rootGoal={rootGoal}
                        isFractalRoute={isFractalRoute}
                        onSwitch={handleSwitchFractal}
                    />

                    <NavigationSessionAction rootId={rootId} userId={user?.id} onClick={handleRouteLinkClick} />

                    {primaryNavItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-text-link ${isActive(item.path) ? 'active' : ''}`}
                            onClick={handleRouteLinkClick}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                {/* Right Side: Actions and Exit */}
                <div className={styles.navContainerRight}>
                    {/* Render Page Specific Actions */}
                    {!isMobile && headerActions && (
                        <>
                            <div className={`nav-separator ${styles.navSeparator}`}></div>
                            {headerActions}
                        </>
                    )}

                    {showLogsNav && (
                        <>
                            <div className={`nav-separator ${styles.navSeparator}`}></div>
                            <Link
                                to={logsNavItem.path}
                                className={`nav-text-link ${isActive(logsNavItem.path) ? 'active' : ''}`}
                                onClick={handleRouteLinkClick}
                            >
                                {logsNavItem.label}
                            </Link>
                        </>
                    )}

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button className="nav-text-link" onClick={handleOpenSettings}>
                        {isMobile ? 'SET' : 'SETTINGS'}
                    </button>

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <Link className="nav-text-link home-link" to="/" onClick={handleRouteLinkClick}>
                        {isMobile ? 'EXIT' : 'EXIT TO HOME'}
                    </Link>
                </div>
            </div>
        </div>
    );
};

