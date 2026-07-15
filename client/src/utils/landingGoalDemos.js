export function buildLandingGoalDemos({
    clearSelectedGoal, fallbackCards, findGoalById, findGoalByType, goalsViewMode,
    handleGoalSelect, selectedExample, selectedGoal, selectedGoalId, setFlowTreeScopeKey,
    setGoalDetailEntry, setGoalsViewMode, setSelectedGoalId, setViewSettings, viewSettings,
}) {
    const configured = selectedExample?.landingContent?.goals?.bullets;
    const cards = Array.isArray(configured) && configured.length ? configured : fallbackCards;
    const demoGoal = findGoalByType(selectedExample?.tree, 'ShortTermGoal')
        || findGoalByType(selectedExample?.tree, 'MidTermGoal')
        || selectedExample?.tree?.children?.[0] || null;
    const activeState = {
        lineage: Boolean(selectedGoal), evidence: viewSettings.fadeInactiveBranches,
        metrics: viewSettings.showMetricsOverlay, layout: goalsViewMode === 'hierarchy',
    };
    const activate = (card) => {
        if (card.goal_id) {
            const goal = findGoalById(selectedExample?.tree, card.goal_id);
            if (goal) {
                const view = card.key === 'associate_activities' ? 'goal-activities'
                    : (card.key === 'set_targets' ? 'target-manager' : 'goal');
                setSelectedGoalId(card.goal_id);
                setGoalDetailEntry((current) => ({ view, targetId: card.key === 'set_targets' ? card.target_id : null, key: current.key + 1 }));
                setFlowTreeScopeKey((current) => current + 1);
                return;
            }
        }
        if (card.key === 'lineage') {
            if (selectedGoalId) clearSelectedGoal();
            else if (demoGoal) handleGoalSelect(demoGoal);
        } else if (card.key === 'evidence') {
            setViewSettings((prev) => ({ ...prev, fadeInactiveBranches: !prev.fadeInactiveBranches }));
        } else if (card.key === 'metrics') {
            setViewSettings((prev) => ({ ...prev, showMetricsOverlay: !prev.showMetricsOverlay }));
        } else if (card.key === 'layout') {
            setGoalsViewMode((prev) => (prev === 'tree' ? 'hierarchy' : 'tree'));
        }
    };
    return { activeState, cards, activate };
}
