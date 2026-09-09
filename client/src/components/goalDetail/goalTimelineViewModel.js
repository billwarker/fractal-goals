import { formatMetricDisplayValue, formatDurationSeconds } from '../../utils/formatters';

function formatTimelineTitle(item) {
    const payload = item.payload || {};
    const activityName = payload.activity_name || payload.name || payload.definition_name;
    const targetName = payload.name || item.title?.replace(/^(Created|Achieved) target:\s*/i, '');
    const goalName = payload.goal_name || item.title?.replace(/^(Created|Completed|Uncompleted|Paused|Resumed) goal:\s*/i, '');

    switch (item.event_type) {
        case 'activity.completed':
            return `Completed activity: ${activityName || 'Activity'}`;
        case 'activity.associated':
            return `Associated activity: ${activityName || 'Activity'}`;
        case 'activity.disassociated':
            return `Disassociated activity: ${activityName || 'Activity'}`;
        case 'activity_group.associated':
            return `Associated activity group: ${payload.activity_group_name || 'Activity group'}`;
        case 'activity_group.disassociated':
            return `Disassociated activity group: ${payload.activity_group_name || 'Activity group'}`;
        case 'target.created':
            return `Created target: ${targetName || 'Target'}`;
        case 'target.achieved':
            return `Achieved target: ${targetName || 'Target'}`;
        case 'goal.created':
            return `Created goal: ${goalName || 'Goal'}`;
        case 'goal.completed':
            return `Completed goal: ${goalName || 'Goal'}`;
        case 'goal.uncompleted':
            return `Uncompleted goal: ${goalName || 'Goal'}`;
        case 'goal.paused':
            return `Paused goal: ${goalName || 'Goal'}`;
        case 'goal.resumed':
            return `Resumed goal: ${goalName || 'Goal'}`;
        default:
            return item.title || 'Timeline event';
    }
}

function isGoalLifecycleEvent(item) {
    return [
        'goal.created',
        'goal.completed',
        'goal.uncompleted',
        'goal.paused',
        'goal.resumed',
    ].includes(item.event_type);
}

function getGoalLifecycleAction(item) {
    switch (item.event_type) {
        case 'goal.completed': return 'Completed';
        case 'goal.uncompleted': return 'Uncompleted';
        case 'goal.paused': return 'Paused';
        case 'goal.resumed': return 'Resumed';
        case 'goal.created':
        default:
            return 'Created';
    }
}

function formatGoalLevelForTitle(levelName) {
    if (!levelName) return '';
    return levelName.replace(/\s+goal$/i, '').trim();
}

function formatEventLabel(item) {
    switch (item.event_type) {
        case 'activity.completed': return 'Completed activity';
        case 'activity.associated': return 'Activity association';
        case 'activity.disassociated': return 'Activity disassociation';
        case 'activity_group.associated': return 'Activity group association';
        case 'activity_group.disassociated': return 'Activity group disassociation';
        case 'target.created': return 'Target created';
        case 'target.achieved': return 'Target achieved';
        case 'goal.created': return 'Goal created';
        case 'goal.completed': return 'Goal completed';
        case 'goal.uncompleted': return 'Goal uncompleted';
        case 'goal.paused': return 'Goal paused';
        case 'goal.resumed': return 'Goal resumed';
        default: return 'Timeline event';
    }
}

function formatContextText(item) {
    if (!item.relationship || item.relationship === 'self') return null;
    const sourceName = item.source_goal_name;

    if (item.relationship === 'descendant') {
        if (isGoalLifecycleEvent(item)) return null;
        if (item.type === 'child_goal') return 'via child goal';
        return sourceName ? `via child goal: ${sourceName}` : 'via child goal';
    }

    if (item.relationship === 'parent_inherited') {
        return sourceName ? `inherited from parent: ${sourceName}` : 'inherited from parent';
    }

    return null;
}

function getTimelineEntryGoalId(item) {
    return item?.entity_type === 'goal'
        ? item.entity_id
        : item?.payload?.goal_id || item?.source_goal_id || null;
}

function goalIdMatches(left, right) {
    if (left == null || right == null) return false;
    return String(left) === String(right);
}

function getGoalIdentity(goal) {
    return goal?.id || goal?.attributes?.id || null;
}

function getGoalStyleLevel(goal) {
    if (!goal) return null;
    return goal.level || goal.level_characteristics || goal.attributes?.level || goal.attributes?.level_characteristics || null;
}

function getGoalLevelName(goal) {
    return goal?.level_name
        || goal?.level?.name
        || goal?.level_characteristics?.name
        || goal?.attributes?.level_name
        || goal?.attributes?.type
        || goal?.type
        || null;
}

function isSmartGoal(goal) {
    if (!goal) return false;
    if (goal.is_smart != null) return Boolean(goal.is_smart);
    if (goal.attributes?.is_smart != null) return Boolean(goal.attributes.is_smart);
    const smartStatus = goal.smart_status || goal.attributes?.smart_status;
    if (smartStatus && typeof smartStatus === 'object') {
        return Object.values(smartStatus).every(Boolean);
    }
    return false;
}

function resolveGoalIconConfig({
    item,
    goalLevel,
    goalLevelHelpers,
    matchingCurrentGoal,
}) {
    if (!goalLevel) return null;

    const levelName = goalLevel.level_name || goalLevel.type || goalLevel.level?.name || null;
    const styleGoal = matchingCurrentGoal || {
        id: goalLevel.id,
        name: goalLevel.name,
        type: goalLevel.type,
        level_id: goalLevel.level_id,
        level_name: levelName,
        level: goalLevel.level,
        is_smart: goalLevel.is_smart,
    };
    const styleLevel = getGoalStyleLevel(styleGoal) || goalLevel.level || null;
    const helperSource = matchingCurrentGoal || levelName || goalLevel.type || styleGoal;
    const helperShape = goalLevelHelpers.getGoalIcon(helperSource);
    const shouldTrustPayloadLevel = goalLevel.level_style_source === 'effective';
    const rawShape = matchingCurrentGoal || shouldTrustPayloadLevel
        ? (styleLevel?.icon || helperShape || 'circle')
        : (helperShape || styleLevel?.icon || 'circle');
    const rawColor = matchingCurrentGoal || shouldTrustPayloadLevel
        ? (styleLevel?.color || goalLevelHelpers.getGoalColor(helperSource))
        : goalLevelHelpers.getGoalColor(helperSource);
    const rawSecondaryColor = matchingCurrentGoal || shouldTrustPayloadLevel
        ? (styleLevel?.secondary_color || goalLevelHelpers.getGoalSecondaryColor(helperSource))
        : goalLevelHelpers.getGoalSecondaryColor(helperSource);
    const usesCompletedGoalPalette = item.event_type === 'goal.completed';

    return {
        shape: rawShape,
        color: usesCompletedGoalPalette ? goalLevelHelpers.getGoalColor('Completed') : rawColor,
        secondaryColor: usesCompletedGoalPalette
            ? goalLevelHelpers.getGoalSecondaryColor('Completed')
            : rawSecondaryColor,
        isSmart: isSmartGoal(styleGoal) || Boolean(goalLevel.is_smart),
    };
}

function normalizeTimelineEntry(item, goalLevelHelpers, currentGoal = null) {
    const payload = item.payload || {};
    const activityInstance = item.event_type === 'activity.completed'
        ? normalizeActivityTimelineInstance(item)
        : null;
    const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
    const visibleMetrics = metrics.map(formatMetricDisplayValue).filter(Boolean).slice(0, 4);
    const duration = payload.duration_seconds ? formatDurationSeconds(payload.duration_seconds) : null;
    const goalLevel = item.type === 'child_goal' || item.type === 'goal_lifecycle'
        ? getTimelineGoalLevel(payload)
        : null;
    const matchingCurrentGoal = goalIdMatches(getTimelineEntryGoalId(item), getGoalIdentity(currentGoal))
        ? currentGoal
        : null;
    const goalStyleSource = matchingCurrentGoal || goalLevel?.level_name || goalLevel?.type || goalLevel;
    const goalColor = goalStyleSource ? goalLevelHelpers.getGoalColor(goalStyleSource) : null;

    return {
        eventLabel: item.subtitle || (isGoalLifecycleEvent(item) ? '' : formatEventLabel(item)),
        title: formatTimelineTitle(item),
        goalTitle: isGoalLifecycleEvent(item) ? {
            action: getGoalLifecycleAction(item),
            level: formatGoalLevelForTitle(goalLevel?.level_name),
            name: payload.goal_name || 'Goal',
        } : null,
        timestamp: item.timestamp,
        contextText: formatContextText(item),
        duration,
        metrics: visibleMetrics,
        activityInstance,
        activityDef: payload.activity_definition || null,
        progressRecord: payload.progress_comparison || null,
        iconConfig: resolveGoalIconConfig({
            item,
            goalLevel,
            goalLevelHelpers,
            matchingCurrentGoal,
        }),
        levelBadge: goalLevel?.level_name && !isGoalLifecycleEvent(item)
            ? { label: goalLevel.level_name, color: goalColor }
            : null,
    };
}


export { getGoalLevelName, normalizeTimelineEntry };
function normalizeActivityTimelineInstance(item) {
    const payload = item.payload || {};
    const notes = Array.isArray(payload.notes)
        ? payload.notes
        : payload.notes
            ? [{ id: `${item.id}:note`, content: payload.notes, created_at: payload.created_at || item.timestamp }]
            : [];
    return {
        ...payload,
        id: payload.id || item.entity_id || item.id,
        created_at: payload.created_at || item.timestamp,
        metric_values: Array.isArray(payload.metric_values)
            ? payload.metric_values
            : Array.isArray(payload.metrics)
                ? payload.metrics
                : [],
        session_name: payload.session_name || item.subtitle,
        session_template_name: payload.session_template_name || payload.session_name || item.subtitle,
        session_template_color: payload.session_template_color || payload.template_color,
        session_date: payload.session_date || payload.created_at || item.timestamp,
        notes,
    };
}

function getTimelineGoalLevel(payload) {
    const level = payload.level || null;
    return {
        id: payload.goal_id,
        name: payload.goal_name,
        type: payload.type,
        level_id: payload.level_id || level?.id,
        level_name: payload.level_name || level?.name || getGoalLevelName(payload),
        is_smart: Boolean(payload.is_smart),
        level,
        level_characteristics: payload.level_characteristics || null,
        level_style_source: payload.level_style_source || null,
    };
}

