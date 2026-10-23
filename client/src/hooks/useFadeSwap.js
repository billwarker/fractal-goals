import { useEffect, useState } from 'react';

import { CHART_FADE_MS } from '../components/goalCharts/useExpandedGoalChart';

/**
 * Cross-fades content when what it shows changes identity (`key`): the current content fades out,
 * stays out until the new content is `ready`, then fades in. Within one key, updates show at once
 * (e.g. a refreshed point). Returns the value to render and whether it should be visible; pair
 * `visible` with an opacity transition of CHART_FADE_MS.
 */
export default function useFadeSwap(value, key, ready = true) {
    // phase: 'shown' → 'out' (fading out) → 'waiting' (out, new content loading) → 'in' → 'shown'
    const [state, setState] = useState({ key, value, phase: 'shown' });
    let current = state;
    if (state.phase === 'shown' && key !== state.key) {
        current = { ...state, phase: 'out' };
        setState(current);
    } else if (state.phase === 'shown' && value !== state.value) {
        current = { ...state, value };
        setState(current);
    } else if (state.phase === 'waiting' && ready) {
        current = { key, value, phase: 'in' };
        setState(current);
    }

    useEffect(() => {
        if (state.phase === 'out') {
            const timer = setTimeout(() => setState((prev) => ({ ...prev, phase: 'waiting' })), CHART_FADE_MS);
            return () => clearTimeout(timer);
        }
        if (state.phase === 'in') {
            // One frame at opacity 0 with the new content, so the transition runs.
            const frame = requestAnimationFrame(() => setState((prev) => ({ ...prev, phase: 'shown' })));
            return () => cancelAnimationFrame(frame);
        }
        return undefined;
    }, [state.phase]);

    return { value: current.value, visible: current.phase === 'shown' };
}
