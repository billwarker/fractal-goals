import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { findGoalNodeById } from '../utils/goalNodeModel';

/**
 * `/:rootId/goals?goal=<id>` opens that goal's details once the tree has loaded, then drops the
 * parameter so closing the details or reloading doesn't reopen it. Other pages (Analytics' Stale
 * Goals) link to a goal this way.
 */
export default function useGoalDeepLink(fractalData, openGoal) {
    const [searchParams, setSearchParams] = useSearchParams();
    const goalId = searchParams.get('goal');
    useEffect(() => {
        if (!goalId || !fractalData) return;
        const node = findGoalNodeById(fractalData, goalId);
        if (node) openGoal(node);
        setSearchParams((params) => {
            const next = new URLSearchParams(params);
            next.delete('goal');
            return next;
        }, { replace: true });
    }, [fractalData, goalId, openGoal, setSearchParams]);
}

export const goalDeepLink = (rootId, goalId) => `/${rootId}/goals?goal=${encodeURIComponent(goalId)}`;
