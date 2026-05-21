import { ACTIVITY_VISUALIZATIONS } from './activities';
import { GOAL_VISUALIZATIONS } from './goals';
import { SESSION_VISUALIZATIONS } from './sessions';

export const VISUALIZATION_CATEGORIES = [
    { id: 'goals', name: 'Goals', iconType: 'category:goals' },
    { id: 'sessions', name: 'Sessions', iconType: 'category:sessions' },
    { id: 'activities', name: 'Activities', iconType: 'category:activities' },
];

export const VISUALIZATION_REGISTRY = [
    ...GOAL_VISUALIZATIONS,
    ...SESSION_VISUALIZATIONS,
    ...ACTIVITY_VISUALIZATIONS,
];

export function getVisualizationsByCategory(category) {
    return VISUALIZATION_REGISTRY.filter((visualization) => visualization.category === category);
}

export function getVisualization(category, id) {
    return VISUALIZATION_REGISTRY.find((visualization) => (
        visualization.category === category && visualization.id === id
    )) || null;
}

export function getVisualizationKey(category, id) {
    return category && id ? `${category}:${id}` : null;
}

export function getVisualizationDefaultState(category, id) {
    const visualization = getVisualization(category, id);
    return visualization ? { ...visualization.defaultState } : {};
}
