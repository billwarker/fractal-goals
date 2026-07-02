function quoteSql(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeList(value) {
    if (!value) return [];
    if (value instanceof Set) return Array.from(value);
    return Array.isArray(value) ? value : [];
}

function formatInList(values = []) {
    return values.map(quoteSql).join(', ');
}

function dateWhereClauses(dateRange, column) {
    const clauses = [];
    if (dateRange?.start) clauses.push(`${column} >= ${quoteSql(`${dateRange.start}T00:00:00`)}`);
    if (dateRange?.end) clauses.push(`${column} <= ${quoteSql(`${dateRange.end}T23:59:59`)}`);
    return clauses;
}

function filterGoalIds(filters) {
    return normalizeList(filters?.goalIds || filters?.filters?.goals?.goalIds);
}

function filterActivityIds(filters) {
    return normalizeList(filters?.activityIds || filters?.filters?.activities?.activityIds);
}

function globalActivityWhereClauses(filters, alias = 'ai') {
    const activityIds = filterActivityIds(filters);
    return activityIds.length ? [`${alias}.activity_definition_id IN (${formatInList(activityIds)})`] : [];
}

function globalGoalWhereClauses(filters, alias = 'g') {
    const goalIds = filterGoalIds(filters);
    return goalIds.length ? [`${alias}.id IN (${formatInList(goalIds)})`] : [];
}

function selectedActivityClauses(context, alias = 'ai') {
    return context.effectiveSelectedActivity?.id
        ? [`${alias}.activity_definition_id = ${quoteSql(context.effectiveSelectedActivity.id)}`]
        : globalActivityWhereClauses(context.globalFilters, alias);
}

function selectedGoalClauses(context, alias = 'g') {
    return context.effectiveSelectedGoal?.id
        ? [`${alias}.id = ${quoteSql(context.effectiveSelectedGoal.id)}`]
        : globalGoalWhereClauses(context.globalFilters, alias);
}

function completedActivityPredicate(alias = 'ai') {
    return `(${alias}.completed = true OR ${alias}.time_stop IS NOT NULL OR COALESCE(${alias}.duration_seconds, 0) > 0)`;
}

function buildWhere(clauses) {
    const compact = clauses.filter(Boolean);
    return compact.length ? `\nWHERE ${compact.join('\n  AND ')}` : '';
}

function metricDefinitionId(metric) {
    return metric?.id || metric?.metric_id || metric?.metric_definition_id || metric || null;
}

function activityMetricDefinitions(context) {
    return context.effectiveSelectedActivity?.metric_definitions || [];
}

function selectedMetricIds(context, mode) {
    const state = context.visualizationState || {};
    const definitions = activityMetricDefinitions(context);
    if (mode === 'scatter') {
        return [
            metricDefinitionId(state.metricX) || definitions[0]?.id,
            metricDefinitionId(state.metricY) || definitions[1]?.id,
        ].filter(Boolean).slice(0, 2);
    }
    if (mode === 'progress') {
        const progressDefinitions = definitions.filter((metric) => metric.track_progress !== false);
        return [metricDefinitionId(state.metric) || progressDefinitions[0]?.id].filter(Boolean);
    }
    const explicit = normalizeList(state.metrics).map(metricDefinitionId).filter(Boolean);
    return (explicit.length ? explicit : definitions.slice(0, 2).map((metric) => metric.id)).slice(0, 2);
}

function metricValueWhereClauses(context, metricIds = []) {
    const clauses = [
        ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
        ...selectedActivityClauses(context, 'ai'),
    ];
    if (metricIds.length) {
        clauses.push(`mv.metric_definition_id IN (${formatInList(metricIds)})`);
    }
    return clauses;
}

function splitNotes(context) {
    const selectedSplit = context.visualizationState?.selectedSplit || 'all';
    return selectedSplit === 'all'
        ? []
        : [`Selected split ${selectedSplit} is applied by the chart read model; expose split_definition_id in the SQL catalog to make this filter directly runnable.`];
}

function baseMetadata({ dataset, rowLimit = 5000, chartFields, aggregation, execution = 'catalog_sql', runnable = true, notes = [] }) {
    return { dataset, rowLimit, chartFields, aggregation, execution, runnable, notes };
}

function activityTotals(context) {
    const state = context.visualizationState || {};
    const metric = state.metric || 'instances';
    const limit = Math.min(50, Math.max(1, Number(state.limit) || 15));
    const valueExpr = metric === 'duration'
        ? 'ROUND(SUM(COALESCE(ai.duration_seconds, 0)) / 60.0)::integer'
        : 'COUNT(ai.id)';
    const valueAlias = metric === 'duration' ? 'minutes' : 'completed_instances';
    const selectGroup = state.showGroups ? ",\n  COALESCE(ag.name, 'Ungrouped') AS activity_group" : '';
    const groupJoin = state.showGroups ? '\nLEFT JOIN activity_groups ag ON ag.id = ad.group_id' : '';
    const groupBy = state.showGroups ? "ad.name, COALESCE(ag.name, 'Ungrouped')" : 'ad.name';
    const clauses = [
        completedActivityPredicate('ai'),
        ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
        ...globalActivityWhereClauses(context.globalFilters),
    ];

    return {
        sql: `SELECT\n  ad.name AS activity_name${selectGroup},\n  ${valueExpr} AS ${valueAlias}\nFROM activity_instances ai\nJOIN activity_definitions ad ON ad.id = ai.activity_definition_id${groupJoin}${buildWhere(clauses)}\nGROUP BY ${groupBy}\nHAVING ${valueExpr} > 0\nORDER BY ${valueAlias} DESC, activity_name ASC\nLIMIT ${limit}`,
        metadata: baseMetadata({
            dataset: 'activity_instances + activity_definitions',
            rowLimit: limit,
            chartFields: ['activity_name', valueAlias],
            aggregation: metric === 'duration' ? 'sum duration by activity' : 'count completed instances by activity',
        }),
    };
}

function activityTrends(context) {
    const metrics = context.visualizationState?.metrics?.length
        ? context.visualizationState.metrics
        : ['instances', 'duration'];
    const selectParts = ["DATE_TRUNC('day', COALESCE(ai.time_stop, ai.time_start, ai.created_at))::date AS day"];
    if (metrics.includes('instances')) selectParts.push('COUNT(ai.id) AS instances');
    if (metrics.includes('duration')) selectParts.push('ROUND(SUM(COALESCE(ai.duration_seconds, 0)) / 60.0)::integer AS minutes');
    const clauses = [
        completedActivityPredicate('ai'),
        ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
        ...globalActivityWhereClauses(context.globalFilters),
    ];
    return {
        sql: `SELECT\n  ${selectParts.join(',\n  ')}\nFROM activity_instances ai${buildWhere(clauses)}\nGROUP BY day\nORDER BY day ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'activity_instances',
            chartFields: selectParts.map((part) => part.split(' AS ').at(-1)),
            aggregation: 'daily completed activity trend',
        }),
    };
}

function activityGroupMix(context) {
    const clauses = [
        completedActivityPredicate('ai'),
        ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
        ...globalActivityWhereClauses(context.globalFilters),
    ];
    return {
        sql: `SELECT\n  COALESCE(ag.name, 'Ungrouped') AS activity_group,\n  COUNT(ai.id) AS completed_instances\nFROM activity_instances ai\nJOIN activity_definitions ad ON ad.id = ai.activity_definition_id\nLEFT JOIN activity_groups ag ON ag.id = ad.group_id${buildWhere(clauses)}\nGROUP BY COALESCE(ag.name, 'Ungrouped')\nHAVING COUNT(ai.id) > 0\nORDER BY completed_instances DESC, activity_group ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'activity_instances + activity_definitions + activity_groups',
            chartFields: ['activity_group', 'completed_instances'],
            aggregation: 'completed activity instances by activity group',
        }),
    };
}

function metricTrends(context) {
    const metricIds = selectedMetricIds(context, 'trend');
    const setsHandling = context.visualizationState?.setsHandling || 'top';
    const valueExpr = setsHandling === 'average'
        ? 'AVG(mv.value::numeric)'
        : 'MAX(mv.value::numeric)';
    const clauses = metricValueWhereClauses(context, metricIds);
    return {
        sql: `SELECT\n  ai.id AS activity_instance_id,\n  COALESCE(ai.time_start, ai.created_at)::date AS instance_date,\n  md.name AS metric_name,\n  ${valueExpr} AS metric_value\nFROM metric_values mv\nJOIN activity_instances ai ON ai.id = mv.activity_instance_id\nJOIN metric_definitions md ON md.id = mv.metric_definition_id${buildWhere(clauses)}\nGROUP BY ai.id, instance_date, md.name\nORDER BY instance_date ASC, activity_instance_id ASC, metric_name ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'metric_values + activity_instances + metric_definitions',
            chartFields: ['instance_date', 'metric_name', 'metric_value'],
            aggregation: setsHandling === 'average' ? 'average metric value per instance' : 'top metric value per instance',
            notes: [
                ...(metricIds.length ? [`Selected metrics: ${metricIds.join(', ')}`] : ['No selected activity metric definitions were available.']),
                ...splitNotes(context),
            ],
        }),
    };
}

function scatterPlot(context) {
    const metricIds = selectedMetricIds(context, 'scatter');
    const clauses = metricValueWhereClauses(context, metricIds);
    return {
        sql: `WITH metric_points AS (\n  SELECT\n    ai.id AS activity_instance_id,\n    COALESCE(ai.time_start, ai.created_at)::date AS instance_date,\n    md.id AS metric_id,\n    md.name AS metric_name,\n    mv.value::numeric AS metric_value\n  FROM metric_values mv\n  JOIN activity_instances ai ON ai.id = mv.activity_instance_id\n  JOIN metric_definitions md ON md.id = mv.metric_definition_id${buildWhere(clauses)}\n), paired_points AS (\n  SELECT\n    activity_instance_id,\n    instance_date,\n    MAX(metric_value) FILTER (WHERE metric_id = ${quoteSql(metricIds[0] || 'x_metric')}) AS x_value,\n    MAX(metric_value) FILTER (WHERE metric_id = ${quoteSql(metricIds[1] || 'y_metric')}) AS y_value\n  FROM metric_points\n  GROUP BY activity_instance_id, instance_date\n)\nSELECT activity_instance_id, instance_date, x_value, y_value\nFROM paired_points\nWHERE x_value IS NOT NULL AND y_value IS NOT NULL\nORDER BY instance_date ASC, activity_instance_id ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'metric_values + activity_instances + metric_definitions',
            chartFields: ['x_value', 'y_value', 'instance_date'],
            aggregation: 'paired metric values per activity instance',
            notes: [
                ...(metricIds.length >= 2 ? [`X metric: ${metricIds[0]}`, `Y metric: ${metricIds[1]}`] : ['Scatter charts require two selected activity metrics.']),
                ...splitNotes(context),
            ],
        }),
    };
}

function metricProgress(context) {
    const metricIds = selectedMetricIds(context, 'progress');
    const clauses = metricValueWhereClauses(context, metricIds);
    return {
        sql: `WITH ordered_values AS (\n  SELECT\n    ai.id AS activity_instance_id,\n    COALESCE(ai.time_stop, ai.time_start, ai.created_at)::date AS instance_date,\n    md.name AS metric_name,\n    mv.value::numeric AS metric_value,\n    LAG(mv.value::numeric) OVER (PARTITION BY mv.metric_definition_id ORDER BY COALESCE(ai.time_stop, ai.time_start, ai.created_at), ai.id) AS previous_metric_value\n  FROM metric_values mv\n  JOIN activity_instances ai ON ai.id = mv.activity_instance_id\n  JOIN metric_definitions md ON md.id = mv.metric_definition_id${buildWhere(clauses)}\n)\nSELECT\n  activity_instance_id,\n  instance_date,\n  metric_name,\n  ROUND(((metric_value - previous_metric_value) / NULLIF(previous_metric_value, 0)) * 100, 2) AS pct_change\nFROM ordered_values\nWHERE previous_metric_value IS NOT NULL\nORDER BY instance_date ASC, activity_instance_id ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'metric_values + activity_instances + metric_definitions',
            chartFields: ['instance_date', 'metric_name', 'pct_change'],
            aggregation: 'percent change from previous tracked metric value',
            notes: ['The chart prefers persisted progress comparisons when present; this SQL mirrors the equivalent ordered metric calculation.'],
        }),
    };
}

function sessionStats(context) {
    const clauses = dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)');
    return {
        sql: `SELECT\n  COUNT(s.id) AS total_sessions,\n  SUM(CASE WHEN s.completed = true THEN 1 ELSE 0 END) AS completed_sessions,\n  ROUND(SUM(COALESCE(s.duration_seconds, 0)) / 60.0)::integer AS total_minutes,\n  ROUND(AVG(COALESCE(s.duration_seconds, 0)) / 60.0)::integer AS avg_minutes\nFROM sessions s${buildWhere(clauses)}\nLIMIT 1`,
        metadata: baseMetadata({
            dataset: 'sessions',
            rowLimit: 1,
            chartFields: ['total_sessions', 'completed_sessions', 'total_minutes', 'avg_minutes'],
            aggregation: 'session summary totals',
        }),
    };
}

function sessionTrends(context) {
    const grain = context.visualizationState?.grain || 'week';
    const metrics = context.visualizationState?.metrics?.length
        ? context.visualizationState.metrics
        : ['sessions', 'duration'];
    const bucket = `DATE_TRUNC('${grain}', COALESCE(s.session_start, s.created_at))::date`;
    const selectParts = [`${bucket} AS ${grain}`];
    if (metrics.includes('sessions')) selectParts.push('COUNT(s.id) AS sessions');
    if (metrics.includes('duration')) selectParts.push('ROUND(SUM(COALESCE(s.duration_seconds, 0)) / 60.0)::integer AS minutes');
    const clauses = dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)');
    return {
        sql: `SELECT\n  ${selectParts.join(',\n  ')}\nFROM sessions s${buildWhere(clauses)}\nGROUP BY ${grain}\nORDER BY ${grain} ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'sessions',
            chartFields: selectParts.map((part) => part.split(' AS ').at(-1)),
            aggregation: `${grain} session trend`,
        }),
    };
}

function sectionPie(context) {
    const clauses = [
        ...dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)'),
    ];
    return {
        sql: `WITH expanded_sections AS (\n  SELECT\n    COALESCE(section->>'name', 'Unnamed section') AS section_name,\n    COALESCE((section->>'duration_minutes')::numeric * 60, 0) AS duration_seconds\n  FROM sessions s\n  CROSS JOIN LATERAL jsonb_array_elements(COALESCE((s.attributes::jsonb #> '{session_data,sections}'), '[]'::jsonb)) AS section${buildWhere(clauses)}\n)\nSELECT\n  section_name,\n  ROUND(SUM(duration_seconds) / 60.0)::integer AS minutes\nFROM expanded_sections\nGROUP BY section_name\nHAVING SUM(duration_seconds) > 0\nORDER BY minutes DESC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'sessions',
            chartFields: ['section_name', 'minutes'],
            aggregation: 'activity duration by session section',
            notes: ['Session sections are stored in the governed sessions.attributes JSON payload.'],
        }),
    };
}

function streaks(context) {
    const clauses = dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)');
    return {
        sql: `WITH practice_days AS (\n  SELECT DISTINCT COALESCE(s.session_start, s.created_at)::date AS practice_day\n  FROM sessions s${buildWhere(clauses)}\n), grouped_days AS (\n  SELECT\n    practice_day,\n    practice_day - (ROW_NUMBER() OVER (ORDER BY practice_day))::integer AS streak_group\n  FROM practice_days\n)\nSELECT\n  MIN(practice_day) AS streak_start,\n  MAX(practice_day) AS streak_end,\n  COUNT(*) AS active_days\nFROM grouped_days\nGROUP BY streak_group\nORDER BY streak_start ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'sessions',
            chartFields: ['streak_start', 'streak_end', 'active_days'],
            aggregation: 'consecutive days with at least one session',
            notes: ['Calendar timezone normalization happens in the chart layer.'],
        }),
    };
}

function startDistribution(context) {
    const markers = context.visualizationState?.markers?.length ? context.visualizationState.markers : ['start'];
    const markerSelects = [];
    if (markers.includes('start')) {
        markerSelects.push("COUNT(s.id) FILTER (WHERE EXTRACT(hour FROM COALESCE(s.session_start, s.created_at)) = hours.hour) AS session_start");
    }
    if (markers.includes('end')) {
        markerSelects.push("COUNT(s.id) FILTER (WHERE EXTRACT(hour FROM COALESCE(s.completed_at, s.session_start, s.created_at)) = hours.hour) AS session_end");
    }
    const clauses = dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)');
    return {
        sql: `WITH hours AS (\n  SELECT generate_series(0, 23) AS hour\n)\nSELECT\n  hours.hour,\n  ${markerSelects.join(',\n  ')}\nFROM hours\nLEFT JOIN sessions s ON true${buildWhere(clauses)}\nGROUP BY hours.hour\nORDER BY hours.hour ASC`,
        metadata: baseMetadata({
            dataset: 'sessions',
            chartFields: ['hour', ...markers.map((marker) => `session_${marker}`)],
            aggregation: 'session count by start/end hour',
            notes: markers.includes('end') ? ['Session end uses completed_at when a dedicated session_end timestamp is absent.'] : [],
        }),
    };
}

function durationHistogram(context) {
    const bucketCount = Math.max(1, Math.min(30, Number(context.visualizationState?.bucketCount) || 5));
    const clauses = dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)');
    return {
        sql: `WITH durations AS (\n  SELECT GREATEST(0, ROUND(COALESCE(s.duration_seconds, 0) / 60.0)::integer) AS minutes\n  FROM sessions s${buildWhere(clauses)}\n), bounds AS (\n  SELECT GREATEST(MAX(minutes), 1) AS max_minutes FROM durations\n), buckets AS (\n  SELECT\n    generate_series(0, ${bucketCount - 1}) AS bucket_index,\n    CEIL((SELECT max_minutes FROM bounds)::numeric / ${bucketCount})::integer AS bucket_size\n)\nSELECT\n  bucket_index,\n  bucket_index * bucket_size AS start_minutes,\n  CASE WHEN bucket_index = ${bucketCount - 1} THEN NULL ELSE (bucket_index + 1) * bucket_size END AS end_minutes,\n  COUNT(d.minutes) AS sessions\nFROM buckets\nLEFT JOIN durations d\n  ON d.minutes >= bucket_index * bucket_size\n  AND (bucket_index = ${bucketCount - 1} OR d.minutes < (bucket_index + 1) * bucket_size)\nGROUP BY bucket_index, bucket_size\nORDER BY bucket_index ASC`,
        metadata: baseMetadata({
            dataset: 'sessions',
            rowLimit: bucketCount,
            chartFields: ['start_minutes', 'end_minutes', 'sessions'],
            aggregation: `${bucketCount} session duration buckets`,
        }),
    };
}

function goalSummary(context) {
    const clauses = globalGoalWhereClauses(context.globalFilters, 'g');
    return {
        sql: `SELECT\n  COUNT(g.id) AS total_goals,\n  SUM(CASE WHEN g.completed = true THEN 1 ELSE 0 END) AS completed_goals,\n  ROUND(AVG(EXTRACT(day FROM (COALESCE(g.completed_at, NOW()) - g.created_at))))::integer AS avg_goal_age_days,\n  ROUND(AVG(EXTRACT(day FROM (g.completed_at - g.created_at))) FILTER (WHERE g.completed_at IS NOT NULL))::integer AS avg_time_to_completion_days\nFROM goals g${buildWhere(clauses)}\nLIMIT 1`,
        metadata: baseMetadata({
            dataset: 'goals',
            rowLimit: 1,
            chartFields: ['total_goals', 'completed_goals', 'avg_goal_age_days', 'avg_time_to_completion_days'],
            aggregation: 'goal summary stats',
        }),
    };
}

function completionTimeline(context) {
    const clauses = [
        'g.completed_at IS NOT NULL',
        ...dateWhereClauses(context.dateRange, 'g.completed_at'),
        ...globalGoalWhereClauses(context.globalFilters, 'g'),
    ];
    return {
        sql: `WITH completed_by_day AS (\n  SELECT\n    g.completed_at::date AS completed_day,\n    COUNT(g.id) AS completed_goals\n  FROM goals g${buildWhere(clauses)}\n  GROUP BY completed_day\n)\nSELECT\n  completed_day,\n  completed_goals,\n  SUM(completed_goals) OVER (ORDER BY completed_day ASC) AS cumulative_completed_goals\nFROM completed_by_day\nORDER BY completed_day ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'goals',
            chartFields: ['completed_day', 'completed_goals', 'cumulative_completed_goals'],
            aggregation: 'completed goals over time',
        }),
    };
}

function timeDistribution(context) {
    const mode = context.visualizationState?.durationMode || 'activity';
    const durationExpr = mode === 'session' ? 's.duration_seconds' : 'ai.duration_seconds';
    const join = mode === 'session'
        ? '\nJOIN session_goals sg ON sg.goal_id = g.id\nJOIN sessions s ON s.id = sg.session_id'
        : '\nJOIN activity_goal_associations aga ON aga.goal_id = g.id\nJOIN activity_instances ai ON ai.activity_definition_id = aga.activity_id';
    const dateColumn = mode === 'session' ? 'COALESCE(s.session_start, s.created_at)' : 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)';
    const clauses = [
        ...globalGoalWhereClauses(context.globalFilters, 'g'),
        ...dateWhereClauses(context.dateRange, dateColumn),
    ];
    return {
        sql: `SELECT\n  g.id AS goal_id,\n  g.name AS goal_name,\n  ROUND(SUM(COALESCE(${durationExpr}, 0)) / 60.0)::integer AS minutes\nFROM goals g${join}${buildWhere(clauses)}\nGROUP BY g.id, g.name\nHAVING SUM(COALESCE(${durationExpr}, 0)) > 0\nORDER BY minutes DESC, goal_name ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: mode === 'session' ? 'goals + sessions' : 'goals + activity_instances',
            chartFields: ['goal_name', 'minutes'],
            aggregation: `${mode} duration by goal`,
            notes: ['Uses direct session-goal or activity-goal associations from the governed catalog.'],
        }),
    };
}

function completionRateByLevel(context) {
    const clauses = globalGoalWhereClauses(context.globalFilters, 'g');
    return {
        sql: `SELECT\n  COALESCE(gl.name, 'Goal') AS goal_level,\n  COUNT(g.id) AS total_goals,\n  SUM(CASE WHEN g.completed = true THEN 1 ELSE 0 END) AS completed_goals,\n  ROUND((SUM(CASE WHEN g.completed = true THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(g.id), 0)) * 100)::integer AS completion_rate\nFROM goals g\nLEFT JOIN goal_levels gl ON gl.id = g.level_id${buildWhere(clauses)}\nGROUP BY COALESCE(gl.name, 'Goal')\nORDER BY completion_rate DESC, goal_level ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'goals + goal_levels',
            chartFields: ['goal_level', 'completion_rate'],
            aggregation: 'completion rate by goal level',
        }),
    };
}

function goalAging(context) {
    const clauses = ['g.completed = false', ...globalGoalWhereClauses(context.globalFilters, 'g')];
    return {
        sql: `SELECT\n  CASE\n    WHEN EXTRACT(day FROM (NOW() - g.created_at)) <= 7 THEN '0-7 days'\n    WHEN EXTRACT(day FROM (NOW() - g.created_at)) <= 30 THEN '8-30 days'\n    WHEN EXTRACT(day FROM (NOW() - g.created_at)) <= 90 THEN '31-90 days'\n    ELSE '90+ days'\n  END AS age_bucket,\n  COUNT(g.id) AS active_goals\nFROM goals g${buildWhere(clauses)}\nGROUP BY age_bucket\nORDER BY MIN(g.created_at) DESC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'goals',
            chartFields: ['age_bucket', 'active_goals'],
            aggregation: 'active goals by age bucket',
        }),
    };
}

function goalMomentum(context) {
    const clauses = [
        ...globalGoalWhereClauses(context.globalFilters, 'g'),
        ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
    ];
    return {
        sql: `SELECT\n  g.id AS goal_id,\n  g.name AS goal_name,\n  ROUND(SUM(COALESCE(ai.duration_seconds, 0)) / 60.0)::integer AS activity_minutes\nFROM goals g\nJOIN activity_goal_associations aga ON aga.goal_id = g.id\nJOIN activity_instances ai ON ai.activity_definition_id = aga.activity_id${buildWhere(clauses)}\nGROUP BY g.id, g.name\nHAVING SUM(COALESCE(ai.duration_seconds, 0)) > 0\nORDER BY activity_minutes DESC, goal_name ASC\nLIMIT 12`,
        metadata: baseMetadata({
            dataset: 'goals + activity_goal_associations + activity_instances',
            rowLimit: 12,
            chartFields: ['goal_name', 'activity_minutes'],
            aggregation: 'top goals by activity time',
            notes: ['Uses direct activity-goal associations from the governed catalog.'],
        }),
    };
}

function staleGoals(context) {
    const clauses = ['g.completed = false', ...globalGoalWhereClauses(context.globalFilters, 'g')];
    return {
        sql: `WITH direct_activity AS (\n  SELECT\n    aga.goal_id,\n    MAX(COALESCE(ai.time_stop, ai.time_start, ai.created_at)) AS last_activity_at\n  FROM activity_goal_associations aga\n  JOIN activity_instances ai ON ai.activity_definition_id = aga.activity_id\n  GROUP BY aga.goal_id\n), direct_sessions AS (\n  SELECT\n    sg.goal_id,\n    MAX(COALESCE(s.session_start, s.created_at)) AS last_session_at\n  FROM session_goals sg\n  JOIN sessions s ON s.id = sg.session_id\n  GROUP BY sg.goal_id\n), goal_activity AS (\n  SELECT\n    g.id,\n    g.name,\n    GREATEST(\n      COALESCE(da.last_activity_at, g.created_at),\n      COALESCE(ds.last_session_at, g.created_at),\n      g.created_at\n    ) AS last_activity_at\n  FROM goals g\n  LEFT JOIN direct_activity da ON da.goal_id = g.id\n  LEFT JOIN direct_sessions ds ON ds.goal_id = g.id${buildWhere(clauses)}\n)\nSELECT\n  id AS goal_id,\n  name AS goal_name,\n  FLOOR(EXTRACT(epoch FROM (NOW() - last_activity_at)) / 86400)::integer AS days_stale\nFROM goal_activity\nWHERE last_activity_at <= NOW() - INTERVAL '14 days'\nORDER BY days_stale DESC, goal_name ASC\nLIMIT 10`,
        metadata: baseMetadata({
            dataset: 'goals + activity_goal_associations + activity_instances + session_goals + sessions',
            rowLimit: 10,
            chartFields: ['goal_name', 'days_stale'],
            aggregation: 'active goals with no recent activity',
            notes: ['Uses direct catalog associations to compute last activity/session evidence.'],
        }),
    };
}

function goalDetail(context) {
    const chart = context.visualizationState?.chart || 'duration';
    const clauses = selectedGoalClauses(context, 'g');
    if (chart === 'activity') {
        const activityClauses = [
            ...clauses,
            ...dateWhereClauses(context.dateRange, 'COALESCE(ai.time_stop, ai.time_start, ai.created_at)'),
        ];
        return {
            sql: `SELECT\n  ad.name AS activity_name,\n  COUNT(ai.id) AS instances,\n  ROUND(SUM(COALESCE(ai.duration_seconds, 0)) / 60.0)::integer AS minutes\nFROM goals g\nJOIN activity_goal_associations aga ON aga.goal_id = g.id\nJOIN activity_instances ai ON ai.activity_definition_id = aga.activity_id\nJOIN activity_definitions ad ON ad.id = ai.activity_definition_id${buildWhere(activityClauses)}\nGROUP BY ad.name\nORDER BY instances DESC, activity_name ASC\nLIMIT 5000`,
            metadata: baseMetadata({
                dataset: 'goals + activity_goal_associations + activity_instances + activity_definitions',
                chartFields: ['activity_name', 'instances', 'minutes'],
                aggregation: 'selected goal activity breakdown',
                notes: ['Uses direct activity-goal associations from the governed catalog.'],
            }),
        };
    }
    const durationClauses = [
        ...clauses,
        ...dateWhereClauses(context.dateRange, 'COALESCE(s.session_start, s.created_at)'),
    ];
    return {
        sql: `SELECT\n  COALESCE(s.session_start, s.created_at)::date AS session_day,\n  ROUND(SUM(COALESCE(s.duration_seconds, 0)) / 60.0)::integer AS minutes\nFROM goals g\nJOIN session_goals sg ON sg.goal_id = g.id\nJOIN sessions s ON s.id = sg.session_id${buildWhere(durationClauses)}\nGROUP BY session_day\nORDER BY session_day ASC\nLIMIT 5000`,
        metadata: baseMetadata({
            dataset: 'goals + session_goals + sessions',
            chartFields: ['session_day', 'minutes'],
            aggregation: 'selected goal duration by day',
            notes: ['Uses direct session-goal associations from the governed catalog.'],
        }),
    };
}

const BUILDERS = {
    'activities:activityFrequency': activityTotals,
    'activities:activityTrends': activityTrends,
    'activities:groupMix': activityGroupMix,
    'activities:metricProgress': metricProgress,
    'activities:metricTrends': metricTrends,
    'activities:scatterPlot': scatterPlot,
    'sessions:durationHistogram': durationHistogram,
    'sessions:sectionPie': sectionPie,
    'sessions:sessionTrends': sessionTrends,
    'sessions:startDistribution': startDistribution,
    'sessions:stats': sessionStats,
    'sessions:streaks': streaks,
    'goals:completionRateByLevel': completionRateByLevel,
    'goals:completionTimeline': completionTimeline,
    'goals:goalAging': goalAging,
    'goals:goalDetail': goalDetail,
    'goals:goalMomentum': goalMomentum,
    'goals:staleGoals': staleGoals,
    'goals:stats': goalSummary,
    'goals:timeDistribution': timeDistribution,
};

export const VISUALIZATION_QUERY_BUILDER_KEYS = Object.keys(BUILDERS);

export function hasVisualizationQueryBuilder(category, visualization) {
    return Boolean(BUILDERS[`${category}:${visualization}`]);
}

export function buildVisualizationQueryExplanation(context) {
    const key = `${context.selectedCategory}:${context.selectedVisualization}`;
    const builder = BUILDERS[key];
    if (!builder) {
        throw new Error(`Missing analytics query explanation builder for ${key}`);
    }
    const explanation = builder(context);
    return {
        sql: explanation.sql,
        metadata: {
            visualization: context.visualization?.name || key,
            category: context.categoryLabel || context.selectedCategory,
            filters: {
                dateRange: context.dateRange || { start: null, end: null },
                goalFilterCount: filterGoalIds(context.globalFilters).length,
                activityFilterCount: filterActivityIds(context.globalFilters).length,
                selectedGoalId: context.effectiveSelectedGoal?.id || null,
                selectedActivityId: context.effectiveSelectedActivity?.id || null,
            },
            resultShape: context.resultShape || {},
            ...explanation.metadata,
        },
    };
}
