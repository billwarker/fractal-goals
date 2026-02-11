import React, { createContext, useContext, useState, useEffect } from 'react';
import { GOAL_COLOR_SYSTEM } from '../utils/goalColors';
import { DEFAULT_GOAL_CHARACTERISTICS } from '../utils/goalCharacteristics';
import { authApi } from '../utils/api';

import { useAuth } from './AuthContext';

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
    const { user, isAuthenticated } = useAuth();

    // --- Light/Dark Mode ---
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
        return 'dark';
    });

    // --- Goal Colors ---
    // Structure: { UltimateGoal: { primary: '#...', secondary: '#...' }, ... }
    const [goalColors, setGoalColors] = useState(() => {
        // Default initialization
        const defaults = {};
        Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
            defaults[key] = {
                primary: GOAL_COLOR_SYSTEM[key].primary,
                secondary: GOAL_COLOR_SYSTEM[key].secondary
            };
        });

        // Try local storage first as fallback
        const savedColors = localStorage.getItem('fractal_goal_colors');
        if (savedColors) {
            try {
                const parsed = JSON.parse(savedColors);
                return { ...defaults, ...parsed };
            } catch (e) {
                console.error("Failed to parse saved goal colors", e);
            }
        }
        return defaults;
    });

    // --- Goal Characteristics ---
    const [goalCharacteristics, setGoalCharacteristics] = useState(() => {
        const saved = localStorage.getItem('fractal_goal_characteristics');
        if (saved) {
            try {
                return { ...DEFAULT_GOAL_CHARACTERISTICS, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Failed to parse saved goal characteristics", e);
            }
        }
        return DEFAULT_GOAL_CHARACTERISTICS;
    });

    // Sync with User Preferences on Login
    useEffect(() => {
        if (isAuthenticated && user?.preferences) {
            if (user.preferences.goal_colors) {
                setGoalColors(prev => ({
                    ...prev,
                    ...user.preferences.goal_colors
                }));
            }
            if (user.preferences.goal_characteristics) {
                setGoalCharacteristics(prev => ({
                    ...prev,
                    ...user.preferences.goal_characteristics
                }));
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
                    await authApi.updatePreferences({
                        preferences: {
                            goal_colors: goalColors,
                            goal_characteristics: goalCharacteristics
                        }
                    });
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

    const setGoalColor = (goalType, type, value) => {
        // type: 'primary' or 'secondary'
        setGoalColors(prev => ({
            ...prev,
            [goalType]: {
                ...prev[goalType],
                [type]: value
            }
        }));
    };

    const setGoalCharacteristic = (goalType, key, value) => {
        setGoalCharacteristics(prev => ({
            ...prev,
            [goalType]: {
                ...prev[goalType],
                [key]: value
            }
        }));
    };

    const resetGoalColors = () => {
        const defaults = {};
        Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
            defaults[key] = {
                primary: GOAL_COLOR_SYSTEM[key].primary,
                secondary: GOAL_COLOR_SYSTEM[key].secondary
            };
        });
        setGoalColors(defaults);
    };

    // --- Helpers (Context Aware) ---
    const getGoalColor = (goalType) => {
        if (!goalType || !goalColors[goalType]) return '#4caf50'; // Fallback
        return goalColors[goalType].primary;
    };

    const getGoalSecondaryColor = (goalType) => {
        if (!goalType || !goalColors[goalType]) return '#1a1a1a'; // Fallback
        return goalColors[goalType].secondary;
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

    return (
        <ThemeContext.Provider value={{
            theme,
            toggleTheme,
            goalColors,
            setGoalColor,
            resetGoalColors,
            goalCharacteristics,
            setGoalCharacteristic,
            getGoalColor,
            getGoalSecondaryColor,
            getGoalColorDark,
            getGoalTextColor,
            // Expose logic helpers if needed elsewhere
            adjustBrightness
        }}>
            {children}
        </ThemeContext.Provider>
    );
};
