import { useEffect } from 'react';

export default function useInitialGoalDetailView({
    goalId, initialView, initialViewKey, isOpen, mode, setViewState,
}) {
    useEffect(() => {
        if (!isOpen || mode !== 'view') return;
        setViewState(initialView === 'goal-activities' ? 'goal-activities' : 'goal');
    // The entry key is the event boundary; modal navigation must not reset on form rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goalId, initialViewKey, isOpen, mode]);
}
