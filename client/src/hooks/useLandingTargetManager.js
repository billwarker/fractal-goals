import { useCallback, useMemo, useState } from 'react';

import { findGoalNodeById } from '../utils/goalNodeModel';

export default function useLandingTargetManager(selectedExample) {
    const [selection, setSelection] = useState(null);
    const activeSelection = useMemo(() => {
        if (!selectedExample || selection?.exampleId !== selectedExample.id) return null;
        const goal = findGoalNodeById(selectedExample.tree, selection.goalId);
        const target = (goal?.attributes?.targets || goal?.targets || [])
            .find((item) => String(item.id) === String(selection.targetId));
        return goal && target ? { goal, target } : null;
    }, [selectedExample, selection]);
    const open = useCallback((goal, target) => {
        if (!selectedExample?.id || !goal?.id || !target?.id) return;
        setSelection({ exampleId: selectedExample.id, goalId: goal.id, targetId: target.id });
    }, [selectedExample]);
    const close = useCallback(() => setSelection(null), []);

    return { activeSelection, close, open };
}
