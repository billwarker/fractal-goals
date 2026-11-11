import { useEffect } from 'react';

const ENTRY_VIEWS = new Set(['goal-activities', 'goal-review']);

export default function useInitialGoalDetailView({
    goalId, initialView, initialViewKey, isOpen, mode, setViewState,
}) {
    useEffect(() => {
        if (!isOpen || mode !== 'view') return;
        setViewState(ENTRY_VIEWS.has(initialView) ? initialView : 'goal');
    // The entry key is the event boundary; modal navigation must not reset on form rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goalId, initialViewKey, isOpen, mode]);
}
