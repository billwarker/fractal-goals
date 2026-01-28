import React, { createContext, useContext, useState, useEffect } from 'react';
import { GOAL_COLOR_SYSTEM } from '../utils/goalColors';

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
        const savedColors = localStorage.getItem('fractal_goal_colors');
        if (savedColors) {
            try {
                // Merge saved colors with defaults to ensure all keys exist if schema changes
                const parsed = JSON.parse(savedColors);
                const defaults = {};
                Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
                    defaults[key] = {
                        primary: GOAL_COLOR_SYSTEM[key].primary,
                        secondary: GOAL_COLOR_SYSTEM[key].secondary
                    };
                });
                return { ...defaults, ...parsed };
            } catch (e) {
                console.error("Failed to parse saved goal colors", e);
            }
        }
        // Default initialization
        const defaults = {};
        Object.keys(GOAL_COLOR_SYSTEM).forEach(key => {
            defaults[key] = {
                primary: GOAL_COLOR_SYSTEM[key].primary,
                secondary: GOAL_COLOR_SYSTEM[key].secondary
            };
        });
        return defaults;
    });

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('fractal_goal_colors', JSON.stringify(goalColors));
    }, [goalColors]);

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
