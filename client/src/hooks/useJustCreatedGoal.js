import { useCallback, useEffect, useState } from 'react';

const HIGHLIGHT_MS = 2400;

/**
 * The id of the goal a hierarchy just created, cleared after a short highlight.
 */
export function useJustCreatedGoal() {
    const [goalId, setGoalId] = useState(null);
    useEffect(() => {
        if (!goalId) return undefined;
        const timer = setTimeout(() => setGoalId(null), HIGHLIGHT_MS);
        return () => clearTimeout(timer);
    }, [goalId]);
    const markCreated = useCallback((goal) => {
        const id = goal?.id ?? goal?.attributes?.id ?? null;
        if (id) setGoalId(String(id));
    }, []);
    return [goalId, markCreated];
}

export default useJustCreatedGoal;
