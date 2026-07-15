import React, { useEffect, useMemo, useState } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import ViewToggleTabs from '../common/ViewToggleTabs';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildGoalAssociationSummary, flattenGoals } from '../activityBuilder/activityBuilderUtils';
import LandingActivityCatalogue from './LandingActivityCatalogue';
import { buildActivityLineage } from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';
import metricModalStyles from '../modals/ManageMetricsModal.module.css';

const ACTIVITY_VIEWS = [
    { key: 'catalogue', label: 'Groups' },
    { key: 'builder', label: 'Builder' },
    { key: 'metrics', label: 'Metrics' },
    { key: 'timeline', label: 'Timeline' },
];

const GOAL_TYPE_ORDER = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal'];
const GOAL_TYPE_LABELS = {
    UltimateGoal: 'Ultimate',
    LongTermGoal: 'Long Term',
    MidTermGoal: 'Mid Term',
    ShortTermGoal: 'Short Term',
    ImmediateGoal: 'Immediate',
};

function getActivityMetrics(activity) {
    const metrics = activity?.metric_definitions || [];
    if (metrics.length) return metrics;
    return [{
        id: 'duration',
        name: 'Duration',
        unit: 'minutes',
        track_progress: true,
        input_type: 'duration',
    }];
}

function resolveActivityGoalIds(activity) {
    return Array.from(new Set([
        ...(activity?.associated_goal_ids || []),
        ...(activity?.associated_goals || []).map((goal) => goal.id),
    ].filter(Boolean).map(String)));
}

function findGoalName(nodes, goalId) {
    const match = nodes.find((goal) => String(goal.id) === String(goalId));
    return match?.name || 'Linked goal';
}

function resolveExampleActivityDefinitions(example) {
    return example?.activityDefinitions || example?.activity_definitions || [];
}

function buildMetricCatalog(example, selectedActivity) {
    const activityDefinitions = resolveExampleActivityDefinitions(example);
    const byKey = new Map();

    activityDefinitions.forEach((activity) => {
        (activity.metric_definitions || []).forEach((metric) => {
            const key = String(metric.fractal_metric_id || metric.id || `${metric.name}-${metric.unit}`);
            const existing = byKey.get(key);
            if (existing) {
                existing.activity_count += 1;
                return;
            }
            byKey.set(key, {
                ...metric,
                id: key,
                activity_count: 1,
            });
        });
    });

    getActivityMetrics(selectedActivity).forEach((metric) => {
        const key = String(metric.fractal_metric_id || metric.id || `${metric.name}-${metric.unit}`);
        if (!byKey.has(key)) {
            byKey.set(key, {
                ...metric,
                id: key,
                activity_count: 1,
            });
        }
    });

    return Array.from(byKey.values()).sort((left, right) => (
        String(left.name || '').localeCompare(String(right.name || ''))
    ));
}

function resolveActivityInstances(example, activity) {
    if (!activity) return [];
    const activityId = String(activity.id);
    const metricDefs = getActivityMetrics(activity);
    const sessions = example?.sessions || [];

    return sessions.flatMap((session) => (
        (session.activity_instances || [])
            .filter((instance) => (
                String(instance.activity_definition_id || instance.definition_id || instance.activity_id || '') === activityId
                || instance.name === activity.name
            ))
            .map((instance) => ({
                ...instance,
                id: instance.id || `${session.id}-${activityId}`,
                name: instance.name || activity.name,
                session_name: session.name || 'Logged session',
                session_date: session.session_start || session.session_end || session.attributes?.session_data?.session_start,
                duration_seconds: (
                    instance.duration_seconds
                    || session.total_duration_seconds
                    || (Number.isFinite(Number(session.duration_minutes)) ? Number(session.duration_minutes) * 60 : null)
                ),
                metric_values: (instance.metric_values || instance.metrics || []).map((metric) => {
                    const metricId = metric.metric_definition_id || metric.metric_id || metric.id;
                    const definition = metricDefs.find((def) => String(def.id) === String(metricId));
                    return {
                        metric_definition_id: metricId,
                        metric_id: metricId,
                        name: metric.name || definition?.name || 'Metric',
                        unit: metric.unit || definition?.unit || '',
                        value: metric.value,
                    };
                }),
                progress_comparison: instance.progress_comparison || instance.progress_record || null,
            }))
    )).sort((left, right) => (
        new Date(right.session_date || 0).getTime() - new Date(left.session_date || 0).getTime()
    ));
}

function buildSyntheticTimeline(activity, realInstances) {
    if (!activity || realInstances.length >= 2) {
        return realInstances.slice(0, 4);
    }

    const metricDefs = getActivityMetrics(activity);
    const primaryMetric = metricDefs[0] || { id: 'duration', name: 'Duration', unit: 'minutes' };
    const parsedBaseValue = Number(realInstances[0]?.metric_values?.[0]?.value ?? 30);
    const baseValue = Number.isFinite(parsedBaseValue) ? parsedBaseValue : 30;
    const sessionName = realInstances[0]?.session_name || `${activity.name} session`;
    const duration = realInstances[0]?.duration_seconds || 1800;

    return [0, 1, 2].map((index) => {
        const value = Math.max(1, Math.round(baseValue * (0.86 + index * 0.11)));
        const previous = index === 0 ? null : Math.max(1, Math.round(baseValue * (0.86 + (index - 1) * 0.11)));
        const delta = previous == null ? null : value - previous;
        const pct = previous ? Math.round((delta / previous) * 100) : null;
        return {
            id: `landing-${activity.id}-timeline-${index}`,
            name: activity.name,
            session_name: sessionName,
            session_date: new Date(Date.UTC(2026, 0, 8 + index * 7, 18, 0, 0)).toISOString(),
            duration_seconds: duration + index * 180,
            metric_values: [{
                metric_definition_id: primaryMetric.id,
                metric_id: primaryMetric.id,
                name: primaryMetric.name,
                unit: primaryMetric.unit || '',
                value,
            }],
            progress_comparison: index === 0 ? { is_first_instance: true, metric_comparisons: [] } : {
                is_first_instance: false,
                metric_comparisons: [{
                    metric_id: primaryMetric.id,
                    metric_name: primaryMetric.name,
                    delta,
                    pct_change: pct,
                    improved: delta >= 0,
                    regressed: delta < 0,
                }],
            },
        };
    }).reverse();
}

function ToggleSwitch({ checked, label }) {
    return (
        <span className={`${styles.readOnlySwitch} ${checked ? styles.readOnlySwitchOn : ''}`} aria-hidden="true">
            <span>{checked ? '✓' : ''}</span>
            <em>{label}</em>
        </span>
    );
}

function FieldPreview({ label, value, multiline = false }) {
    return (
        <label>
            <span>{label}</span>
            {multiline ? <textarea value={value} readOnly /> : <input value={value} readOnly />}
        </label>
    );
}

// Shows admin-featured activities plus the goal lineage each one feeds, making
// activity -> goal inheritance visible: linked goals highlight as targets and
// their ancestors glow up to the ultimate goal.
export default function LandingFeatureActivity({
    example,
    activity,
    activeView = 'builder',
    onViewChange,
}) {
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const [previewSelectedGoalIds, setPreviewSelectedGoalIds] = useState([]);
    const [selectedMetricId, setSelectedMetricId] = useState(null);
    const selectedActivity = activity || null;

    const lineage = useMemo(
        () => buildActivityLineage(example.tree, selectedActivity),
        [example.tree, selectedActivity]
    );
    const metricDefs = useMemo(() => getActivityMetrics(selectedActivity), [selectedActivity]);
    const metricCatalog = useMemo(
        () => buildMetricCatalog(example, selectedActivity),
        [example, selectedActivity]
    );
    const selectedMetric = metricCatalog.find((metric) => metric.id === selectedMetricId)
        || metricCatalog[0]
        || metricDefs[0]
        || null;
    const activityGoalIds = useMemo(() => resolveActivityGoalIds(selectedActivity), [selectedActivity]);
    const allGoals = useMemo(
        () => flattenGoals(example.tree, selectedActivity?.id),
        [example.tree, selectedActivity?.id]
    );
    const associationSummary = useMemo(
        () => buildGoalAssociationSummary(allGoals, previewSelectedGoalIds),
        [allGoals, previewSelectedGoalIds]
    );
    const realTimelineItems = useMemo(
        () => resolveActivityInstances(example, selectedActivity),
        [example, selectedActivity]
    );
    const timelineItems = useMemo(
        () => buildSyntheticTimeline(selectedActivity, realTimelineItems),
        [selectedActivity, realTimelineItems]
    );

    useEffect(() => {
        setPreviewSelectedGoalIds(activityGoalIds);
    }, [activityGoalIds]);

    if (!selectedActivity && activeView !== 'catalogue') {
        return <div className={styles.emptyState}>Publish an example with activities to preview goal inheritance.</div>;
    }

    const renderAssociationSummary = () => (
        <div className={styles.builderAssociationSummary}>
            <div className={styles.builderAssociationHeader}>
                <span>Associated Goals ({previewSelectedGoalIds.length})</span>
                <span>Select Goals</span>
            </div>
            {previewSelectedGoalIds.length > 0 ? (
                <div className={styles.builderSummaryGrid}>
                    {GOAL_TYPE_ORDER.map((type) => {
                        const stats = associationSummary[type];
                        if (!stats) return null;
                        const color = getGoalColor(type);
                        const countParts = [];
                        if (stats.direct > 0) countParts.push(`${stats.direct} direct`);
                        if (stats.inherited > 0) countParts.push(`${stats.inherited} inherited`);
                        return (
                            <div className={styles.builderSummaryItem} key={type}>
                                <GoalIcon shape={getGoalIcon(type)} color={color} size={13} />
                                <div>
                                    <strong style={{ color }}>{GOAL_TYPE_LABELS[type] || type}</strong>
                                    <span>{countParts.join(', ')}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
            <p>Goals with associated activities meet the SMART &quot;Achievable&quot; criterion</p>
        </div>
    );

    const renderMetricSelectPreview = () => (
        <div className={styles.builderMetricPreview}>
            <span>Metrics (Max 3)</span>
            {metricDefs.slice(0, 3).map((metric, index) => (
                <div className={styles.builderMetricCard} key={metric.id || metric.name || index}>
                    <div className={styles.builderMetricSelect}>
                        <span>{metric.name || `Metric ${index + 1}`}{metric.unit ? ` (${metric.unit})` : ''}</span>
                        <small>⌄</small>
                    </div>
                    <div className={styles.builderMetricBadges}>
                        <em className={styles.builderMetricBadgeMultiplicative}>Multiplicative</em>
                        <em className={styles.builderMetricBadgeAdditive}>Additive</em>
                        <em className={styles.builderMetricBadgeDirection}>
                            {metric.higher_is_better === false ? 'Lower is better' : 'Higher is better'}
                        </em>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderBuilderView = () => (
        <div className={styles.activityBuilderSplitViewport} aria-label="Activity builder and goal selector preview">
            <section className={styles.builderModalShell} aria-label="Read-only activity builder modal">
                <div className={styles.previewModalHeader}>
                    <div>
                        <h3>Edit Activity</h3>
                    </div>
                </div>
                <div className={styles.builderModalBody}>
                    <div className={styles.builderPreviewGrid}>
                        <FieldPreview label="Activity Name" value={selectedActivity.name || ''} />
                        <FieldPreview
                            label="Description"
                            value={selectedActivity.description || 'Reusable activity definition with goal links and metric rules.'}
                            multiline
                        />
                    </div>
                    {renderAssociationSummary()}
                    <FieldPreview label="Activity Group" value={selectedActivity.group_name || 'Standalone activity'} />
                    <div className={styles.builderPreviewOptions}>
                        <ToggleSwitch checked={selectedActivity.has_sets !== false} label="Track Sets" />
                        <ToggleSwitch checked={(selectedActivity.split_definitions || []).length > 0} label="Track Splits" />
                        <ToggleSwitch checked={selectedActivity.has_metrics !== false} label="Enable Metrics" />
                        <ToggleSwitch checked={selectedActivity.track_progress !== false} label="Track Progress" />
                    </div>
                    <FieldPreview label="Delta display (overrides root setting)" value={selectedActivity.delta_display_mode || 'Inherit from root'} />
                    {renderMetricSelectPreview()}
                </div>
            </section>

            <section className={styles.goalSelectorModalShell} aria-label="Goal hierarchy selection modal preview">
                <div className={styles.previewModalHeader}>
                    <div>
                        <h3>Associate &quot;{selectedActivity.name}&quot;</h3>
                    </div>
                </div>
                <div className={styles.goalSelectorModalBody}>
                    <GoalHierarchySelector
                        goals={allGoals}
                        selectedGoalIds={previewSelectedGoalIds}
                        onSelectionChange={setPreviewSelectedGoalIds}
                        selectionMode="multiple"
                        searchPlaceholder="Search goals..."
                        emptyState="No goals available."
                        highlightSelectionAncestors
                        showAncestorControls={false}
                        compactLayout
                    />
                </div>
            </section>
        </div>
    );

    const renderMetricsView = () => (
        <div className={styles.metricsModalPreview} aria-label="Manage metrics modal preview">
            <div className={styles.previewModalHeader}>
                <div>
                    <h3>Manage Metrics</h3>
                </div>
            </div>
            <div className={`${metricModalStyles.content} ${styles.metricsModalContent}`}>
                <div className={metricModalStyles.listSection}>
                    <div className={metricModalStyles.listSectionInner}>
                        <div className={metricModalStyles.sectionHeading}>Metrics</div>
                        <ul className={metricModalStyles.metricList}>
                            {metricCatalog.map((metric) => (
                                <li
                                    className={`${metricModalStyles.metricRow} ${metric.id === selectedMetric?.id ? metricModalStyles.metricRowSelected : ''}`}
                                    key={metric.id || metric.name}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedMetricId(metric.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setSelectedMetricId(metric.id);
                                        }
                                    }}
                                >
                                    <div className={metricModalStyles.metricTop}>
                                        <div className={metricModalStyles.metricNameRow}>
                                            <span className={metricModalStyles.metricName}>{metric.name || 'Metric'}</span>
                                            <div className={metricModalStyles.badges}>
                                                {metric.is_multiplicative !== false && <span className={metricModalStyles.badge}>×</span>}
                                                {metric.is_additive !== false && <span className={metricModalStyles.badge}>+</span>}
                                                {metric.input_type && metric.input_type !== 'number' && (
                                                    <span className={metricModalStyles.badge}>{metric.input_type}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={metricModalStyles.metricBottom}>
                                        <span className={metricModalStyles.metricUnit}>{metric.unit || 'value'}</span>
                                        <span className={metricModalStyles.usageCount}>
                                            {metric.activity_count || 1} {(metric.activity_count || 1) === 1 ? 'activity' : 'activities'}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className={metricModalStyles.formSection}>
                    <div className={metricModalStyles.formScrollable}>
                        <div className={metricModalStyles.sectionHeading}>Create Metric</div>
                        <div className={metricModalStyles.formRow}>
                            <label className={styles.metricsPreviewField}>
                                <span>Name *</span>
                                <input value={selectedMetric?.name || 'Reps'} readOnly />
                            </label>
                            <label className={styles.metricsPreviewField}>
                                <span>Unit *</span>
                                <input value={selectedMetric?.unit || 'reps'} readOnly />
                            </label>
                        </div>
                        <div className={metricModalStyles.fieldGroup}>
                            <label className={metricModalStyles.fieldLabel}>Input type</label>
                            <select className={metricModalStyles.select} defaultValue="number" aria-label="Input type">
                                <option value="number">Number (decimal)</option>
                            </select>
                        </div>
                        <div className={metricModalStyles.toggleRow}>
                            <label className={metricModalStyles.toggleLabel}>
                                <input type="checkbox" checked={selectedMetric?.is_multiplicative !== false} readOnly />
                                <span>Multiplicative</span>
                                <span className={metricModalStyles.hint}>Can be multiplied with other multiplicative metrics.</span>
                            </label>
                            <label className={metricModalStyles.toggleLabel}>
                                <input type="checkbox" checked={selectedMetric?.is_additive !== false} readOnly />
                                <span>Additive</span>
                                <span className={metricModalStyles.hint}>Values sum across sets and sessions.</span>
                            </label>
                        </div>
                        <div className={metricModalStyles.fieldGroup}>
                            <label className={metricModalStyles.fieldLabel}>Trend direction</label>
                            <div className={metricModalStyles.radioRow}>
                                <label className={metricModalStyles.radioLabel}>
                                    <input type="radio" checked={selectedMetric?.higher_is_better == null} readOnly />
                                    Neutral
                                </label>
                                <label className={metricModalStyles.radioLabel}>
                                    <input type="radio" checked={selectedMetric?.higher_is_better === true} readOnly />
                                    Higher is better
                                </label>
                                <label className={metricModalStyles.radioLabel}>
                                    <input type="radio" checked={selectedMetric?.higher_is_better === false} readOnly />
                                    Lower is better
                                </label>
                            </div>
                        </div>
                        <label className={styles.metricsPreviewField}>
                            <span>Default value</span>
                            <input placeholder="Pre-fill session input" readOnly />
                        </label>
                        <label className={styles.metricsPreviewField}>
                            <span>Predefined values</span>
                            <input placeholder="5, 8, 10, 12, 15" readOnly />
                        </label>
                        <div className={metricModalStyles.inputHint}>Comma-separated numbers. When set, session inputs only allow these values.</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderTimelineView = () => (
        <div className={styles.activityTimelinePreview} aria-label="Activity completion timeline preview">
            <div className={styles.previewModalHeader}>
                <div>
                    <span className={styles.previewEyebrow}>Completion timeline</span>
                    <h3>{selectedActivity.name}</h3>
                </div>
                <span className={styles.readOnlyBadge}>History compared</span>
            </div>
            <div className={styles.timelineSummaryGrid}>
                <span>Completions <strong>{timelineItems.length}</strong></span>
                <span>Metrics <strong>{metricDefs.length}</strong></span>
                <span>Feeds <strong>{activityGoalIds.map((id) => findGoalName(lineage.nodes, id))[0] || 'goal lineage'}</strong></span>
            </div>
            <div className={styles.activityTimelineList}>
                {timelineItems.map((item) => (
                    <ActivityTimelineCard
                        key={item.id}
                        instance={item}
                        activityDef={selectedActivity}
                        progressRecord={item.progress_comparison}
                        timezone="UTC"
                        showActivityName
                        showTime
                    />
                ))}
            </div>
        </div>
    );

    const renderActiveView = () => {
        if (activeView === 'catalogue') {
            return (
                <LandingActivityCatalogue
                    activities={resolveExampleActivityDefinitions(example)}
                    activityGroups={example?.activityGroups || example?.activity_groups || []}
                    instantiationSummary={example?.activityInstantiationSummary || example?.activity_instantiation_summary || {}}
                />
            );
        }
        if (activeView === 'metrics') return renderMetricsView();
        if (activeView === 'timeline') return renderTimelineView();
        return renderBuilderView();
    };

    return (
        <div className={styles.activityStage}>
            <div className={styles.activityViewportHeader}>
                <ViewToggleTabs
                    items={ACTIVITY_VIEWS.map((view) => ({ value: view.key, label: view.label }))}
                    value={activeView}
                    onChange={onViewChange}
                    ariaLabel="Activity showcase views"
                    className={styles.activityViewTabs}
                    style={{
                        '--view-toggle-panel-bg': 'var(--color-bg-card)',
                    }}
                />
            </div>
            <div className={styles.activityViewportBody}>
                {renderActiveView()}
            </div>
        </div>
    );
}
