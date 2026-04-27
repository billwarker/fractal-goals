export const GOAL_DETAIL_NAVIGATION_EVENT = 'fractal-goals:goal-detail-navigation';

export function dismissGoalDetailsForNavigation() {
    window.dispatchEvent(new CustomEvent(GOAL_DETAIL_NAVIGATION_EVENT));
}
