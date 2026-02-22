import React, { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { globalApi } from '../utils/api';
import { useAuth } from './AuthContext';

const GoalLevelsContext = createContext();


export function adjustBrightness(hex, percent) {
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

export function GoalLevelsProvider({ children }) {
    const { isAuthenticated, user } = useAuth();
    const queryClient = useQueryClient();

    // Extract rootId from URL path (pattern: /:rootId/...)
    // UUID pattern: 8-4-4-4-12 hex characters
    const getRootIdFromUrl = () => {
        const match = window.location.pathname.match(/^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        return match ? match[1] : null;
    };

    const [currentRootId, setCurrentRootId] = React.useState(getRootIdFromUrl);

    // Keep rootId in sync with URL changes
    React.useEffect(() => {
        const handleLocationChange = () => {
            const newRootId = getRootIdFromUrl();
            setCurrentRootId(prev => prev !== newRootId ? newRootId : prev);
        };
        // Listen for popstate (back/forward) and custom navigation events
        window.addEventListener('popstate', handleLocationChange);
        // Also poll briefly to catch pushState navigations from React Router
        const interval = setInterval(handleLocationChange, 500);
        return () => {
            window.removeEventListener('popstate', handleLocationChange);
            clearInterval(interval);
        };
    }, []);

    const {
        data: goalLevels = [],
        isLoading,
        error
    } = useQuery({
        queryKey: ['goalLevels', currentRootId],
        queryFn: async () => {
            const res = await globalApi.getGoalLevels(currentRootId);
            return res.data;
        },
        enabled: isAuthenticated
    });

    const updateGoalLevelMutation = useMutation({
        mutationFn: async ({ id, updates }) => {
            // Always include root_id in updates so backend creates fractal-scoped clone
            const res = await globalApi.updateGoalLevel(id, { ...updates, root_id: currentRootId });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goalLevels', currentRootId] });
            queryClient.invalidateQueries({ queryKey: ['fractals'] });
        }
    });

    const resetGoalLevelMutation = useMutation({
        mutationFn: async (id) => {
            const res = await globalApi.resetGoalLevel(id);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goalLevels', currentRootId] });
            queryClient.invalidateQueries({ queryKey: ['fractals'] });
        }
    });

    // --- Helpers for Components ---

    // Fallback dictionary just in case DB is completely empty or still loading
    const FALLBACK_COLOR = '#4caf50';

    const getLevelById = (levelId) => {
        return goalLevels.find(l => l.id === levelId) || null;
    };

    const getLevelByName = (name) => {
        return goalLevels.find(l => l.name === name) || null;
    };

    const getGoalColor = (goal) => {
        if (!goal) return FALLBACK_COLOR;

        // If we already have the level object fully populated from a join:
        if (goal.level?.color) return goal.level.color;

        // If we just have the ID:
        if (goal.level_id) {
            const lvl = getLevelById(goal.level_id);
            if (lvl?.color) return lvl.color;
        }

        if (goal.level_name) {
            const lvl = getLevelByName(goal.level_name);
            if (lvl?.color) return lvl.color;
        }

        // Handle direct string passes (e.g., 'LongTermGoal' or 'Completed') from legacy components
        if (typeof goal === 'string') {
            if (goal === 'Completed') return user?.preferences?.completed_primary_color || FALLBACK_COLOR;

            // Convert 'LongTermGoal' to 'Long Term Goal'
            const normalizedName = goal.replace(/([A-Z])/g, ' $1').trim();
            const lvl = getLevelByName(normalizedName) || getLevelByName(goal);
            if (lvl?.color) return lvl.color;
        }

        return FALLBACK_COLOR;
    };

    // For when components know the name (e.g. from ThemeContext legacy calls)
    const getColorByName = (name) => {
        if (name === 'Completed') return user?.preferences?.completed_primary_color || FALLBACK_COLOR;
        const lvl = getLevelByName(name);
        return lvl?.color || FALLBACK_COLOR;
    };

    const getGoalIcon = (goal) => {
        if (!goal) return 'circle';
        if (goal?.level?.icon) return goal.level.icon;
        if (goal?.level_id) {
            const lvl = getLevelById(goal.level_id);
            if (lvl?.icon) return lvl.icon;
        }
        if (typeof goal === 'string') {
            if (goal === 'Completed') return 'check';
            const normalizedName = goal.replace(/([A-Z])/g, ' $1').trim();
            const lvl = getLevelByName(normalizedName) || getLevelByName(goal);
            if (lvl?.icon) return lvl.icon;
        }
        return 'circle'; // absolute fallback
    };

    // Helpers relying on getGoalColor:
    const getGoalSecondaryColor = (goal) => {
        // Handle Completed string first
        if (goal === 'Completed') {
            if (user?.preferences?.completed_secondary_color) return user.preferences.completed_secondary_color;
            const primary = getGoalColor(goal);
            return adjustBrightness(primary, -0.6);
        }
        // Check if database has a custom secondary_color for this level
        if (goal && typeof goal === 'string') {
            const normalizedName = goal.replace(/([A-Z])/g, ' $1').trim();
            const lvl = getLevelByName(normalizedName) || getLevelByName(goal);
            if (lvl?.secondary_color) return lvl.secondary_color;
        } else if (goal?.level?.secondary_color) {
            return goal.level.secondary_color;
        } else if (goal?.level_id) {
            const lvl = getLevelById(goal.level_id);
            if (lvl?.secondary_color) return lvl.secondary_color;
        }
        // Fallback: auto-derive from primary
        const primary = getGoalColor(goal);
        return adjustBrightness(primary, -0.6);
    };

    const getGoalTextColor = (goal) => {
        // Calculate contrast. If bright primary, use dark text. If dark primary, use light text.
        const hex = getGoalColor(goal).replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#1a1a1a' : '#FFFFFF';
    };

    const getGoalColorDark = (goal) => adjustBrightness(getGoalColor(goal), -0.2);

    const getCompletionColor = () => getGoalColor('Completed');

    /**
     * Get full level characteristics for a goal type.
     * Returns all DB-driven characteristics merged from the level.
     */
    const getLevelCharacteristics = (goalOrType) => {
        const level = _resolveLevel(goalOrType);
        if (!level) return {};
        return {
            allow_manual_completion: level.allow_manual_completion ?? true,
            track_activities: level.track_activities ?? true,
            requires_smart: level.requires_smart ?? false,
            deadline_min_value: level.deadline_min_value,
            deadline_min_unit: level.deadline_min_unit,
            deadline_max_value: level.deadline_max_value,
            deadline_max_unit: level.deadline_max_unit,
            max_children: level.max_children,
            auto_complete_when_children_done: level.auto_complete_when_children_done ?? false,
            can_have_targets: level.can_have_targets ?? true,

            description_required: level.description_required ?? false,
            default_deadline_offset_value: level.default_deadline_offset_value,
            default_deadline_offset_unit: level.default_deadline_offset_unit,
            sort_children_by: level.sort_children_by,
        };
    };


    const canHaveTargets = (goalOrType) => {
        const chars = getLevelCharacteristics(goalOrType);
        return chars.can_have_targets ?? true;
    };

    const getDeadlineConstraints = (goalOrType) => {
        const chars = getLevelCharacteristics(goalOrType);
        return {
            minValue: chars.deadline_min_value,
            minUnit: chars.deadline_min_unit,
            maxValue: chars.deadline_max_value,
            maxUnit: chars.deadline_max_unit,
        };
    };

    // Internal helper to resolve a goal/type to a level object
    const _resolveLevel = (goalOrType) => {
        if (!goalOrType || !goalLevels) return null;
        if (typeof goalOrType === 'string') {
            return getLevelByName(goalOrType);
        }
        // It's a goal object — resolve by type or level_id
        const type = goalOrType.type || goalOrType.attributes?.type;
        if (type) return getLevelByName(type);
        return null;
    };

    const value = {
        goalLevels,
        isLoading,
        error,
        getLevelById,
        getLevelByName,
        getGoalColor,
        getColorByName,
        getGoalIcon,
        getGoalSecondaryColor,
        getGoalTextColor,
        getGoalColorDark,
        getCompletionColor,
        getLevelCharacteristics,
        canHaveTargets,
        getDeadlineConstraints,
        updateGoalLevel: updateGoalLevelMutation.mutateAsync,
        resetGoalLevel: resetGoalLevelMutation.mutateAsync
    };

    return (
        <GoalLevelsContext.Provider value={value}>
            {children}
        </GoalLevelsContext.Provider>
    );
}

export const useGoalLevels = () => {
    const context = useContext(GoalLevelsContext);
    if (!context) {
        throw new Error("useGoalLevels must be used within a GoalLevelsProvider");
    }
    return context;
};
