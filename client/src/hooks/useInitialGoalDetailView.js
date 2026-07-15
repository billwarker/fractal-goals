import { useEffect } from 'react';

export default function useInitialGoalDetailView({
    goalId, initialTargetId, initialView, initialViewKey, isOpen, mode,
    setTargetToEdit, setViewState, targets,
}) {
    useEffect(() => {
        if (!isOpen || mode !== 'view') return;
        if (initialView === 'target-manager') {
            const target = targets.find((item) => item.id === initialTargetId) || null;
            setTargetToEdit(target);
            setViewState(target ? 'target-manager' : 'goal');
            return;
        }
        setTargetToEdit(null);
        setViewState(initialView === 'goal-activities' ? 'goal-activities' : 'goal');
    // The entry key is the event boundary; modal navigation must not reset on form rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goalId, initialViewKey, isOpen, mode]);
}
