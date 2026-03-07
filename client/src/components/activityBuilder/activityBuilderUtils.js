export const DEFAULT_METRIC = {
    name: '',
    unit: '',
    is_top_set_metric: false,
    is_multiplicative: true,
};

export const DEFAULT_SPLITS = [
    { name: 'Split #1' },
    { name: 'Split #2' },
];

export function normalizeMetricRows(rows) {
    const normalized = [];
    for (let i = 0; i < rows.length; i += 1) {
        const metric = rows[i] || {};
        const nameValue = (metric.name || '').trim();
        const unitValue = (metric.unit || '').trim();

        if (!nameValue && !unitValue) {
            continue;
        }

        if (!nameValue || !unitValue) {
            return {
                error: `Metric ${i + 1} must include both name and unit.`,
                metrics: null,
            };
        }

        normalized.push({ ...metric, name: nameValue, unit: unitValue });
    }

    return { error: null, metrics: normalized };
}

function parseGoalTargets(node) {
    const rawTargets = node?.attributes?.targets ?? node?.targets;
    if (!rawTargets) {
        return [];
    }

    if (Array.isArray(rawTargets)) {
        return rawTargets;
    }

    if (typeof rawTargets === 'string') {
        try {
            const parsed = JSON.parse(rawTargets);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    return [];
}

export function flattenGoals(node, activityId, goals = []) {
    if (!node) {
        return goals;
    }

    const childrenIds = node.children ? node.children.map((child) => child.id || child.attributes?.id) : [];
    const targets = parseGoalTargets(node);
    const hasTargetForActivity = !!activityId && targets.some((target) => {
        const targetActivityId = target?.activity_id || target?.activity_definition_id;
        return targetActivityId === activityId;
    });

    goals.push({
        id: node.id || node.attributes?.id,
        name: node.name,
        type: node.attributes?.type || node.type,
        childrenIds,
        hasTargetForActivity,
    });

    if (node.children && node.children.length > 0) {
        node.children.forEach((child) => flattenGoals(child, activityId, goals));
    }

    return goals;
}

function hasSelectedDescendant(goal, selectedGoalIds, goalsById) {
    if (!goal.childrenIds || goal.childrenIds.length === 0) {
        return false;
    }

    return goal.childrenIds.some((childId) => {
        if (selectedGoalIds.includes(childId)) {
            return true;
        }

        const childGoal = goalsById.get(childId);
        return childGoal ? hasSelectedDescendant(childGoal, selectedGoalIds, goalsById) : false;
    });
}

export function buildGoalAssociationSummary(allGoals, selectedGoalIds) {
    const goalsById = new Map(allGoals.map((goal) => [goal.id, goal]));

    return allGoals.reduce((summary, goal) => {
        const isDirect = selectedGoalIds.includes(goal.id);
        const isInherited = !isDirect && hasSelectedDescendant(goal, selectedGoalIds, goalsById);

        if (!isDirect && !isInherited) {
            return summary;
        }

        if (!summary[goal.type]) {
            summary[goal.type] = { direct: 0, inherited: 0 };
        }

        if (isDirect) {
            summary[goal.type].direct += 1;
        }

        if (isInherited) {
            summary[goal.type].inherited += 1;
        }

        return summary;
    }, {});
}

export function getInitialActivityBuilderState(editingActivity) {
    if (!editingActivity) {
        return {
            name: '',
            description: '',
            metrics: [DEFAULT_METRIC],
            hasSets: false,
            hasMetrics: true,
            metricsMultiplicative: false,
            hasSplits: false,
            splits: DEFAULT_SPLITS,
            groupId: '',
            selectedGoalIds: [],
        };
    }

    const metricDefinitions = editingActivity.metric_definitions || [];
    const splitDefinitions = editingActivity.split_definitions || [];

    return {
        name: editingActivity.name,
        description: editingActivity.description || '',
        metrics: metricDefinitions.length > 0
            ? metricDefinitions.map((metric) => ({
                id: metric.id,
                name: metric.name,
                unit: metric.unit,
                is_top_set_metric: metric.is_top_set_metric || false,
                is_multiplicative: metric.is_multiplicative !== undefined ? metric.is_multiplicative : true,
            }))
            : [DEFAULT_METRIC],
        hasSets: editingActivity.has_sets,
        hasMetrics: metricDefinitions.length > 0 || editingActivity.has_metrics,
        metricsMultiplicative: editingActivity.metrics_multiplicative || false,
        hasSplits: editingActivity.has_splits || false,
        splits: splitDefinitions.length > 0
            ? splitDefinitions.map((split) => ({ id: split.id, name: split.name }))
            : DEFAULT_SPLITS,
        groupId: editingActivity.group_id || '',
        selectedGoalIds: editingActivity.associated_goal_ids || [],
    };
}
