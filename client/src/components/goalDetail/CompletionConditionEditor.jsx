import React, { useId, useMemo } from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityTagCatalog';
import { useGoalConditionPreview } from '../../hooks/useGoalConditionQueries';
import Input from '../atoms/Input';
import Select from '../atoms/Select';
import ActivityTagBadges from '../common/ActivityTagBadges';
import ViewToggleTabs from '../common/ViewToggleTabs';
import {
    COMPLETION_CONDITION_LABELS,
    CONDITION_KINDS,
    MAX_CONDITION_NAME_LENGTH,
    TOTAL_OPERATORS,
    activeMetricDefinitions,
    activityUsesSets,
    buildConditionPayload,
    changeDraftActivity,
    changeDraftKind,
    createConditionDraft,
    inferOperator,
    validateConditionDraft,
    yieldMetricIds,
} from '../../utils/goalConditions';
import { describeConditionParts, describeTagMatch } from '../../utils/goalConditionText';
import { ConditionTagFilter, OperatorSelect, RuleRow, SetAggregateToggle } from './ConditionEditorFields';
import styles from './CompletionConditionEditor.module.css';

const CONDITION_HINTS = {
    activity_threshold: 'Completes on its own when your logged activity reaches the threshold.',
    children: 'Completes on its own when every child goal is complete.',
    manual: 'Completes when you mark it complete.',
};

const KIND_HINTS = {
    single_session: 'Reach it within one session.',
    cumulative: 'Add up across every session in the goal’s active period.',
    consistency: 'Repeat it a number of times in the goal’s active period.',
};

const MEASURE_LABELS = { sets: 'Sets meeting rules', metric: 'A metric total', yield: 'Total yield' };
const NO_SETS_MEASURE_LABELS = { ...MEASURE_LABELS, sets: 'Meets metric rules' };
const EMPTY_CATALOG = { families: [], tags: [] };

/** The editor with server reads: the tag catalog and, for a saved goal, bests to hint values. */
function ConnectedEditor({ rootId, goalId, ...props }) {
    const { data } = useActivityTagCatalog(rootId);
    const { draft, activityDefinitions = [], completionCondition } = props;
    const activity = activityDefinitions.find((candidate) => candidate.id === draft?.activity_definition_id) || null;
    const isValid = (candidate) => completionCondition === 'activity_threshold' && candidate && activity
        && Object.keys(validateConditionDraft(candidate, activity)).length === 0;
    // Bests per metric do not depend on the thresholds, so blank values are probed as 0: the
    // fields can show "Best …" before the user types.
    const probe = draft ? {
        ...draft,
        target_value: draft.target_value === '' ? '0' : draft.target_value,
        rules: (draft.rules || []).map((rule) => (rule.value === '' ? { ...rule, value: '0' } : rule)),
    } : null;
    const { progress } = useGoalConditionPreview(rootId, goalId, isValid(probe) ? buildConditionPayload(probe) : null);
    return (
        <ThresholdEditor
            {...props}
            rootId={rootId}
            tagCatalog={data || EMPTY_CATALOG}
            ruleBests={progress?.rule_bests || []}
        />
    );
}

/**
 * How a goal completes. With `rootId`, an activity threshold can also require tags, and with
 * `goalId` it hints each rule's best logged value. Server reads happen only then, so the
 * editor also works outside a query client.
 */
function CompletionConditionEditor({ rootId = null, goalId = null, ...props }) {
    if (!rootId) return <ThresholdEditor {...props} tagCatalog={null} ruleBests={[]} />;
    return <ConnectedEditor rootId={rootId} goalId={goalId} {...props} />;
}

function ThresholdEditor({
    completionCondition,
    onCompletionConditionChange,
    draft,
    onDraftChange,
    activityDefinitions = [],
    associatedActivityIds = [],
    goalName = '',
    canCompleteViaChildren = true,
    errors = {},
    rootId = null,
    tagCatalog,
    ruleBests,
}) {
    const measureName = useId();
    const associated = useMemo(() => new Set((associatedActivityIds || []).map(String)), [associatedActivityIds]);
    const activity = activityDefinitions.find((candidate) => candidate.id === draft?.activity_definition_id) || null;
    // Only the goal's own activities, plus a prefilled one that saving will link.
    const choices = activityDefinitions.filter((candidate) => (
        associated.has(String(candidate.id)) || candidate.id === activity?.id
    ));
    const metrics = activeMetricDefinitions(activity);
    const hasYield = yieldMetricIds(activity).length > 0;
    const usesSets = activityUsesSets(activity);
    const measureLabels = usesSets ? MEASURE_LABELS : NO_SETS_MEASURE_LABELS;
    const tagIds = draft?.tag_ids || [];
    const bestByMetric = new Map(ruleBests
        .filter((rule) => rule.best != null)
        .map((rule) => [rule.metric_definition_id, rule.best]));
    const tagsById = new Map((tagCatalog?.tags || []).map((tag) => [tag.id, tag]));

    const conditionOptions = ['activity_threshold', ...(canCompleteViaChildren || completionCondition === 'children' ? ['children'] : []), 'manual']
        .map((value) => ({ value, label: COMPLETION_CONDITION_LABELS[value] }));

    const chooseCondition = (value) => {
        onCompletionConditionChange(value);
        if (value === 'activity_threshold' && !draft) {
            onDraftChange(createConditionDraft(choices[0] || null));
        }
    };

    const updateDraft = (patch) => onDraftChange({ ...draft, ...patch });
    const usedMetricIds = new Set((draft?.rules || []).map((rule) => rule.metric_definition_id));
    const nextMetric = metrics.find((metric) => !usedMetricIds.has(metric.id));
    // Yield is offered only where the activity has one; otherwise it is noise.
    const measures = draft
        ? (CONDITION_KINDS[draft.kind]?.measures || ['sets']).filter((measure) => measure !== 'yield' || hasYield)
        : [];
    const requiredTags = tagIds.map((id) => tagsById.get(id)).filter(Boolean);
    const previewCondition = draft && activity ? {
        ...buildConditionPayload(draft),
        min_sets: draft.min_sets,
        required_count: draft.required_count,
        target_value: draft.target_value,
        rules: draft.rules,
        tags: requiredTags,
    } : null;
    const [previewBefore, previewAfter] = describeConditionParts(previewCondition, activity);

    return (
        <div className={styles.editor}>
            <ViewToggleTabs
                items={conditionOptions}
                value={completionCondition}
                onChange={chooseCondition}
                ariaLabel="How this goal completes"
                className={styles.conditionTabs}
            />
            <p className={styles.hint}>
                {CONDITION_HINTS[completionCondition]}
                {completionCondition !== 'manual' ? ' You can always complete it yourself.' : ''}
            </p>

            {completionCondition === 'activity_threshold' && draft && choices.length > 0 ? (
                <div className={styles.threshold}>
                    <Input
                        label="Name"
                        value={draft.name ?? ''}
                        placeholder={goalName || 'Defaults to the goal’s name'}
                        maxLength={MAX_CONDITION_NAME_LENGTH}
                        error={errors.name}
                        onChange={(event) => updateDraft({ name: event.target.value })}
                    />
                    <Select
                        label="Activity"
                        value={draft.activity_definition_id}
                        error={errors.activity}
                        onChange={(event) => {
                            const nextActivity = activityDefinitions.find((candidate) => candidate.id === event.target.value);
                            onDraftChange(changeDraftActivity(draft, nextActivity));
                        }}
                    >
                        {!activity ? <option value="">Choose an activity…</option> : null}
                        {choices.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    </Select>

                    {activity ? (
                        <>
                            <ViewToggleTabs
                                items={Object.entries(CONDITION_KINDS).map(([value, kind]) => ({ value, label: kind.label }))}
                                value={draft.kind}
                                onChange={(kind) => onDraftChange(changeDraftKind(draft, kind, activity))}
                                ariaLabel="Threshold kind"
                                className={styles.kindTabs}
                            />
                            <p className={styles.hint}>{KIND_HINTS[draft.kind]}</p>

                            {measures.length > 1 ? (
                                <div className={styles.measureRow} role="radiogroup" aria-label="Measure">
                                    {measures.map((measure) => (
                                        <label key={measure} className={styles.measureOption}>
                                            <input
                                                type="radio"
                                                name={measureName}
                                                value={measure}
                                                checked={draft.measure === measure}
                                                onChange={() => updateDraft({
                                                    measure,
                                                    rules: measure === 'sets' && draft.rules.length === 0
                                                        ? createConditionDraft(activity, draft.kind).rules
                                                        : draft.rules,
                                                })}
                                            />
                                            {measureLabels[measure]}
                                        </label>
                                    ))}
                                </div>
                            ) : null}
                            {errors.measure ? <span className={styles.error} role="alert">{errors.measure}</span> : null}

                            {draft.measure === 'sets' ? (
                                <div className={styles.rules}>
                                    {draft.kind === 'single_session' && !usesSets ? (
                                        <div className={styles.countRow}><span>In one session, where</span></div>
                                    ) : draft.kind === 'single_session' ? (
                                        <div className={styles.countRow}>
                                            <span>At least</span>
                                            <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={draft.min_sets}
                                                aria-label="Sets"
                                                aria-invalid={Boolean(errors.min_sets)}
                                                className={styles.countInput}
                                                onChange={(event) => updateDraft({ min_sets: event.target.value })}
                                            />
                                            <span>{Number(draft.min_sets) === 1 ? 'set where' : 'sets where'}</span>
                                            <SetAggregateToggle value={draft.set_aggregate} onChange={(set_aggregate) => updateDraft({ set_aggregate })} />
                                            <span>is</span>
                                        </div>
                                    ) : (
                                        <div className={styles.countRow}>
                                            <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={draft.required_count}
                                                aria-label="Times"
                                                aria-invalid={Boolean(errors.required_count)}
                                                className={styles.countInput}
                                                onChange={(event) => updateDraft({ required_count: event.target.value })}
                                            />
                                            <span>
                                                {draft.rules.length === 0
                                                    ? 'completed sessions'
                                                    : usesSets ? 'sessions with at least' : 'sessions where'}
                                            </span>
                                            {draft.rules.length > 0 && usesSets ? (
                                                <>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        value={draft.min_sets}
                                                        aria-label="Sets"
                                                        aria-invalid={Boolean(errors.min_sets)}
                                                        className={styles.countInput}
                                                        onChange={(event) => updateDraft({ min_sets: event.target.value })}
                                                    />
                                                    <span>{Number(draft.min_sets) === 1 ? 'set where' : 'sets where'}</span>
                                                    <SetAggregateToggle
                                                        value={draft.set_aggregate}
                                                        onChange={(set_aggregate) => updateDraft({ set_aggregate })}
                                                    />
                                                    <span>is</span>
                                                </>
                                            ) : null}
                                        </div>
                                    )}
                                    {usesSets && draft.rules.length > 0 ? (
                                        <p className={styles.hint}>
                                            {draft.set_aggregate === 'average'
                                                ? 'The average across every counted set must meet each rule.'
                                                : 'Each of those sets must meet every rule.'}
                                        </p>
                                    ) : null}
                                    {draft.kind === 'consistency' ? (
                                        <label className={styles.checkRow}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(draft.consecutive)}
                                                disabled={Number(draft.required_count) === 1 && !draft.consecutive}
                                                onChange={(event) => updateDraft({ consecutive: event.target.checked })}
                                            />
                                            <span>
                                                In a row
                                                <span className={styles.checkHint}>
                                                    {draft.rules.length > 0 || tagIds.length > 0
                                                        ? ' — a logged session that misses resets the count'
                                                        : ' — every logged session counts, so this only matters with rules or tags'}
                                                </span>
                                            </span>
                                        </label>
                                    ) : null}
                                    {errors.min_sets ? <span className={styles.error} role="alert">{errors.min_sets}</span> : null}
                                    {errors.required_count ? <span className={styles.error} role="alert">{errors.required_count}</span> : null}
                                    {draft.rules.map((rule, index) => (
                                        <RuleRow
                                            key={`${rule.metric_definition_id}-${index}`}
                                            rule={rule}
                                            index={index}
                                            metrics={metrics}
                                            usedMetricIds={usedMetricIds}
                                            error={errors[`rule-${index}`]}
                                            canRemove={draft.kind === 'consistency' || draft.rules.length > 1}
                                            best={bestByMetric.get(rule.metric_definition_id) ?? null}
                                            onChange={(nextRule) => updateDraft({
                                                rules: draft.rules.map((candidate, position) => (position === index ? nextRule : candidate)),
                                            })}
                                            onRemove={() => updateDraft({ rules: draft.rules.filter((_, position) => position !== index) })}
                                        />
                                    ))}
                                    {errors.rules ? <span className={styles.error} role="alert">{errors.rules}</span> : null}
                                    {nextMetric ? (
                                        <button
                                            type="button"
                                            className={styles.addRule}
                                            onClick={() => updateDraft({
                                                rules: [...draft.rules, {
                                                    metric_definition_id: nextMetric.id,
                                                    operator: inferOperator(nextMetric),
                                                    value: '',
                                                }],
                                            })}
                                        >
                                            + Add a metric rule
                                        </button>
                                    ) : null}
                                    {metrics.length === 0 && draft.kind !== 'consistency' ? (
                                        <p className={styles.subtle}>{activity.name} tracks no metrics; use Consistency to count sessions.</p>
                                    ) : null}
                                </div>
                            ) : (
                                <div className={styles.totalRow}>
                                    {draft.measure === 'metric' ? (
                                        <Select
                                            value={draft.metric_definition_id}
                                            aria-label="Metric to total"
                                            error={errors.metric}
                                            onChange={(event) => {
                                                const metric = metrics.find((candidate) => candidate.id === event.target.value);
                                                updateDraft({ metric_definition_id: event.target.value, operator: inferOperator(metric) });
                                            }}
                                        >
                                            {metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.name}</option>)}
                                        </Select>
                                    ) : <span className={styles.totalLabel}>Total yield</span>}
                                    <OperatorSelect
                                        value={draft.operator}
                                        operators={TOTAL_OPERATORS}
                                        label="Total comparison"
                                        onChange={(operator) => updateDraft({ operator })}
                                    />
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="any"
                                        value={draft.target_value}
                                        aria-label="Total"
                                        aria-invalid={Boolean(errors.target_value)}
                                        onChange={(event) => updateDraft({ target_value: event.target.value })}
                                    />
                                    {errors.target_value ? <span className={styles.error} role="alert">{errors.target_value}</span> : null}
                                </div>
                            )}

                            {tagCatalog ? (
                                <ConditionTagFilter
                                    rootId={rootId}
                                    activityId={activity.id}
                                    tagIds={tagIds}
                                    tagMatch={draft.tag_match}
                                    usesSets={usesSets}
                                    error={errors.tags}
                                    onChange={(next) => updateDraft({ tag_ids: next })}
                                    onTagMatchChange={(tag_match) => updateDraft({ tag_match })}
                                />
                            ) : null}

                            {previewCondition ? (
                                <p className={styles.preview} data-testid="condition-preview">
                                    {previewBefore}
                                    {requiredTags.length ? (
                                        <>
                                            {` ${describeTagMatch(previewCondition)} `}
                                            <ActivityTagBadges tags={requiredTags} className={styles.previewTrail} ariaLabel="Required tags" />
                                        </>
                                    ) : null}
                                    {previewAfter}
                                </p>
                            ) : null}
                        </>
                    ) : null}
                </div>
            ) : null}
            {completionCondition === 'activity_threshold' && choices.length === 0 ? (
                <p className={styles.subtle}>Link an activity to this goal to complete it on a threshold.</p>
            ) : null}
        </div>
    );
}

export default CompletionConditionEditor;
