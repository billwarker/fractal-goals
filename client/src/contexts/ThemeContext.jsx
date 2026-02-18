import React, { createContext, useContext, useState, useEffect } from 'react';
import { GOAL_COLOR_SYSTEM } from '../utils/goalColors';
import { DEFAULT_GOAL_CHARACTERISTICS } from '../utils/goalCharacteristics';
import { authApi } from '../utils/api';

import { useAuth } from './AuthContext';
import { useGoals } from './GoalsContext';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

// Helper: Adjust brightness of a hex color (duplicated from goalColors.js to avoid circular deps or ensure purity)
function adjustBrightness(hex, percent) {
    hex = hex.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.min(255, Math.max(0, r + (r * percent)));
    g = Math.min(255, Math.max(0, g + (g * percent)));
    b = Math.min(255, Math.max(0, b + (b * percent)));
    const rr = Math.round(r).toString(16).padStart(2, '0');
    const gg = Math.round(g).toString(16).padStart(2, '0');
    const bb = Math.round(b).toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
}

export const ThemeProvider = ({ children }) => {
    const { user, isAuthenticated, setUser } = useAuth();
    const { activeRootId } = useGoals();

    // --- Light/Dark Mode ---
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
        return 'dark';
    });

    // --- Goal Colors ---
    const [goalColors, setGoalColors] = useState(() => {
        const defaults = {};
        Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
            defaults[key] = {
                primary: GOAL_COLOR_SYSTEM[key].primary,
                secondary: GOAL_COLOR_SYSTEM[key].secondary
            };
        });

        const initial = {
            default: defaults,
            fractals: {}
        };

        const savedColors = localStorage.getItem('fractal_goal_colors');
        if (savedColors) {
            try {
                const parsed = JSON.parse(savedColors);
                // Migration: if parsed is flat (e.g. has UltimateGoal key), wrap it in default
                if (parsed.UltimateGoal) {
                    return { ...initial, default: { ...defaults, ...parsed } };
                }
                return {
                    ...initial,
                    ...parsed,
                    default: { ...defaults, ...(parsed.default || {}) }
                };
            } catch (e) {
                console.error("Failed to parse saved goal colors", e);
            }
        }
        return initial;
    });

    // --- Goal Characteristics ---
    const [goalCharacteristics, setGoalCharacteristics] = useState(() => {
        const initial = {
            default: DEFAULT_GOAL_CHARACTERISTICS,
            fractals: {}
        };

        const saved = localStorage.getItem('fractal_goal_characteristics');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Migration: if parsed is flat, wrap it in default
                if (parsed.UltimateGoal) {
                    return { ...initial, default: { ...DEFAULT_GOAL_CHARACTERISTICS, ...parsed } };
                }
                return {
                    ...initial,
                    ...parsed,
                    default: { ...DEFAULT_GOAL_CHARACTERISTICS, ...(parsed.default || {}) }
                };
            } catch (e) {
                console.error("Failed to parse saved goal characteristics", e);
            }
        }
        return initial;
    });

    // Sync with User Preferences on Login
    useEffect(() => {
        if (isAuthenticated && user?.preferences) {
            if (user.preferences.goal_colors) {
                setGoalColors(prev => {
                    const incoming = user.preferences.goal_colors;
                    // Migration helper for incoming data if it's flat
                    if (incoming.UltimateGoal) {
                        return { ...prev, default: { ...prev.default, ...incoming } };
                    }
                    return { ...prev, ...incoming };
                });
            }
            if (user.preferences.goal_characteristics) {
                setGoalCharacteristics(prev => {
                    const incoming = user.preferences.goal_characteristics;
                    // Migration helper for incoming data if it's flat
                    if (incoming.UltimateGoal) {
                        return { ...prev, default: { ...prev.default, ...incoming } };
                    }
                    return { ...prev, ...incoming };
                });
            }
        }
    }, [isAuthenticated, user]);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        // Save to localStorage
        localStorage.setItem('fractal_goal_colors', JSON.stringify(goalColors));
        localStorage.setItem('fractal_goal_characteristics', JSON.stringify(goalCharacteristics));

        // Save to backend if logged in
        if (isAuthenticated) {
            const savePreferences = async () => {
                try {
                    const res = await authApi.updatePreferences({
                        preferences: {
                            goal_colors: goalColors,
                            goal_characteristics: goalCharacteristics
                        }
                    });
                    // Update user context with returned data to keep in sync
                    setUser(res.data);
                } catch (err) {
                    console.error("Failed to save preferences to user settings", err);
                }
            };

            const colorsChanged = !user?.preferences?.goal_colors || JSON.stringify(user.preferences.goal_colors) !== JSON.stringify(goalColors);
            const characteristicsChanged = !user?.preferences?.goal_characteristics || JSON.stringify(user.preferences.goal_characteristics) !== JSON.stringify(goalCharacteristics);

            if (colorsChanged || characteristicsChanged) {
                savePreferences();
            }
        }
    }, [goalColors, goalCharacteristics, isAuthenticated, user?.preferences]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const setGoalColor = (goalType, field, value, scope = 'default') => {
        setGoalColors(prev => {
            const next = { ...prev };
            if (scope === 'default') {
                next.default = {
                    ...next.default,
                    [goalType]: { ...next.default[goalType], [field]: value }
                };
            } else {
                next.fractals = {
                    ...next.fractals,
                    [scope]: {
                        ...(next.fractals[scope] || {}),
                        [goalType]: {
                            ...(next.fractals[scope]?.[goalType] || next.default[goalType]),
                            [field]: value
                        }
                    }
                };
            }
            return next;
        });
    };

    const setGoalCharacteristic = (goalType, key, value, scope = 'default') => {
        setGoalCharacteristics(prev => {
            const next = { ...prev };
            if (scope === 'default') {
                next.default = {
                    ...next.default,
                    [goalType]: { ...next.default[goalType], [key]: value }
                };
            } else {
                next.fractals = {
                    ...next.fractals,
                    [scope]: {
                        ...(next.fractals[scope] || {}),
                        [goalType]: {
                            ...(next.fractals[scope]?.[goalType] || next.default[goalType]),
                            [key]: value
                        }
                    }
                };
            }
            return next;
        });
    };

    const resetGoalColors = (scope = 'default') => {
        if (scope === 'default') {
            const defaults = {};
            Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
                defaults[key] = {
                    primary: GOAL_COLOR_SYSTEM[key].primary,
                    secondary: GOAL_COLOR_SYSTEM[key].secondary
                };
            });
            setGoalColors(prev => ({ ...prev, default: defaults }));
        } else {
            setGoalColors(prev => {
                const next = { ...prev };
                const nextFractals = { ...next.fractals };
                delete nextFractals[scope];
                return { ...next, fractals: nextFractals };
            });
        }
    };

    const resetGoalCharacteristics = (scope = 'default') => {
        if (scope === 'default') {
            setGoalCharacteristics(prev => ({ ...prev, default: DEFAULT_GOAL_CHARACTERISTICS }));
        } else {
            setGoalCharacteristics(prev => {
                const next = { ...prev };
                const nextFractals = { ...next.fractals };
                delete nextFractals[scope];
                return { ...next, fractals: nextFractals };
            });
        }
    };

    // --- Helpers (Context Aware) ---
    const getScopedColors = (goalType) => {
        if (activeRootId && goalColors.fractals[activeRootId]?.[goalType]) {
            return { ...goalColors.default[goalType], ...goalColors.fractals[activeRootId][goalType] };
        }
        return goalColors.default[goalType];
    };

    const getScopedCharacteristics = (goalType) => {
        if (activeRootId && goalCharacteristics.fractals[activeRootId]?.[goalType]) {
            return { ...goalCharacteristics.default[goalType], ...goalCharacteristics.fractals[activeRootId][goalType] };
        }
        return goalCharacteristics.default[goalType];
    };

    const getGoalColor = (goalType) => {
        const colors = getScopedColors(goalType);
        return colors?.primary || GOAL_COLOR_SYSTEM[goalType]?.primary || '#4caf50';
    };

    const getGoalSecondaryColor = (goalType) => {
        const colors = getScopedColors(goalType);
        return colors?.secondary || GOAL_COLOR_SYSTEM[goalType]?.secondary || '#1a1a1a';
    };

    // Helper to get dark variant of the *current* goal color
    const getGoalColorDark = (goalType, amount = 0.2) => {
        const color = getGoalColor(goalType);
        return adjustBrightness(color, -amount);
    };

    // Helper for text color (dark/light) based on primary background
    const getGoalTextColor = (goalType) => {
        const color = getGoalColor(goalType);
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 155 ? '#1a1a1a' : '#ffffff';
    };

    const getCompletionColor = () => {
        return getGoalColor('Completed');
    };

    const getCompletionIcon = () => {
        return getScopedCharacteristics('Completed')?.icon || 'check';
    };

    return (
        <ThemeContext.Provider value={{
            theme,
            toggleTheme,
            goalColors,
            setGoalColor,
            resetGoalColors,
            goalCharacteristics,
            setGoalCharacteristic,
            resetGoalCharacteristics,
            getGoalColor,
            getGoalSecondaryColor,
            getGoalColorDark,
            getGoalTextColor,
            getScopedCharacteristics,
            getScopedColors,
            getCompletionColor,
            getCompletionIcon,
            // Expose logic helpers if needed elsewhere
            adjustBrightness
        }}>
            {children}
        </ThemeContext.Provider>
    );
};
