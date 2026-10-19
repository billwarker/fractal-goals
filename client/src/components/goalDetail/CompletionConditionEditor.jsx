import React, { useMemo } from 'react';

import Input from '../atoms/Input';
import Select from '../atoms/Select';
import ViewToggleTabs from '../common/ViewToggleTabs';
import {
    COMPLETION_CONDITION_LABELS,
    CONDITION_KINDS,
    OPERATOR_SYMBOLS,
    RULE_OPERATORS,
    TOTAL_OPERATORS,
    activeMetricDefinitions,
    buildConditionPayload,
    changeDraftActivity,
    changeDraftKind,
    createConditionDraft,
    describeCondition,
    inferOperator,
    yieldMetricIds,
} from '../../utils/goalConditions';
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

function OperatorSelect({ value, operators, onChange, label }) {
    return (
        <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
            {operators.map((operator) => (
                <option key={operator} value={operator}>{OPERATOR_SYMBOLS[operator]}</option>
            ))}
        </Select>
    );
}

function RuleRow({ rule, index, metrics, usedMetricIds, error, onChange, onRemove, canRemove }) {
    const metric = metrics.find((candidate) => candidate.id === rule.metric_definition_id);
    return (
        <div className={styles.ruleRow}>
            <Select
                value={rule.metric_definition_id}
                aria-label={`Rule ${index + 1} metric`}
                onChange={(event) => {
                    const next = metrics.find((candidate) => candidate.id === event.target.value);
                    onChange({ ...rule, metric_definition_id: event.target.value, operator: inferOperator(next) });
                }}
            >
                {metrics.map((candidate) => (
                    <option
                        key={candidate.id}
                        value={candidate.id}
                        disabled={candidate.id !== rule.metric_definition_id && usedMetricIds.has(candidate.id)}
                    >
                        {candidate.name}
                    </option>
                ))}
            </Select>
            <OperatorSelect
                value={rule.operator}
                operators={RULE_OPERATORS}
                label={`Rule ${index + 1} comparison`}
                onChange={(operator) => onChange({ ...rule, operator })}
            />
            <div className={styles.valueField}>
                <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={rule.value}
                    aria-label={`Rule ${index + 1} value`}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => onChange({ ...rule, value: event.target.value })}
                />
                {metric?.unit ? <span className={styles.unit}>{metric.unit}</span> : null}
            </div>
            {canRemove ? (
                <button type="button" className={styles.removeRule} onClick={onRemove} aria-label={`Remove rule ${index + 1}`}>
                    ×
                </button>
            ) : <span className={styles.removeRulePlaceholder} />}
            {error ? <span className={styles.ruleError} role="alert">{error}</span> : null}
        </div>
    );
}

function CompletionConditionEditor({
    completionCondition,
    onCompletionConditionChange,
    draft,
    onDraftChange,
    activityDefinitions = [],
    associatedActivityIds = [],
    canCompleteViaChildren = true,
    errors = {},
}) {
    const associated = useMemo(() => new Set((associatedActivityIds || []).map(String)), [associatedActivityIds]);
    const linkedActivities = activityDefinitions.filter((activity) => associated.has(String(activity.id)));
    const otherActivities = activityDefinitions.filter((activity) => !associated.has(String(activity.id)));
    const activity = activityDefinitions.find((candidate) => candidate.id === draft?.activity_definition_id) || null;
    const metrics = activeMetricDefinitions(activity);
    const hasYield = yieldMetricIds(activity).length > 0;

    const conditionOptions = ['activity_threshold', ...(canCompleteViaChildren || completionCondition === 'children' ? ['children'] : []), 'manual']
        .map((value) => ({ value, label: COMPLETION_CONDITION_LABELS[value] }));

    const chooseCondition = (value) => {
        onCompletionConditionChange(value);
        if (value === 'activity_threshold' && !draft) {
            const firstActivity = linkedActivities[0] || otherActivities[0] || null;
            onDraftChange(createConditionDraft(firstActivity));
        }
    };

    const updateDraft = (patch) => onDraftChange({ ...draft, ...patch });
    const usedMetricIds = new Set((draft?.rules || []).map((rule) => rule.metric_definition_id));
    const nextMetric = metrics.find((metric) => !usedMetricIds.has(metric.id));
    const measures = draft ? CONDITION_KINDS[draft.kind]?.measures || ['sets'] : [];
    const preview = draft && activity ? describeCondition(
        {
            ...buildConditionPayload(draft),
            min_sets: draft.min_sets,
            required_count: draft.required_count,
            target_value: draft.target_value,
            rules: draft.rules,
        },
        activity,
    ) : '';

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

            {completionCondition === 'activity_threshold' && draft ? (
                <div className={styles.threshold}>
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
                        {linkedActivities.length > 0 ? (
                            <optgroup label="Linked to this goal">
                                {linkedActivities.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                            </optgroup>
                        ) : null}
                        {otherActivities.length > 0 ? (
                            <optgroup label={linkedActivities.length > 0 ? 'Other activities' : 'Activities'}>
                                {otherActivities.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                            </optgroup>
                        ) : null}
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
                                    {measures.map((measure) => {
                                        const disabled = measure === 'yield' && !hasYield;
                                        return (
                                            <label key={measure} className={`${styles.measureOption} ${disabled ? styles.measureDisabled : ''}`}>
                                                <input
                                                    type="radio"
                                                    name="condition-measure"
                                                    value={measure}
                                                    checked={draft.measure === measure}
                                                    disabled={disabled}
                                                    onChange={() => updateDraft({
                                                        measure,
                                                        rules: measure === 'sets' && draft.rules.length === 0
                                                            ? createConditionDraft(activity, draft.kind).rules
                                                            : draft.rules,
                                                    })}
                                                />
                                                {MEASURE_LABELS[measure]}
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : null}
                            {!hasYield && measures.includes('yield') ? (
                                <p className={styles.subtle}>Total yield needs two or more multiplied metrics.</p>
                            ) : null}
                            {errors.measure ? <span className={styles.error} role="alert">{errors.measure}</span> : null}

                            {draft.measure === 'sets' ? (
                                <div className={styles.rules}>
                                    {draft.kind === 'single_session' ? (
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
                                            <span>{draft.rules.length > 0 ? 'sessions with a set where' : 'completed sessions'}</span>
                                        </div>
                                    )}
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

                            {preview ? <p className={styles.preview} data-testid="condition-preview">{preview}</p> : null}
                        </>
                    ) : null}
                </div>
            ) : null}
            {completionCondition === 'activity_threshold' && activityDefinitions.length === 0 ? (
                <p className={styles.subtle}>Create an activity first to complete this goal on a threshold.</p>
            ) : null}
        </div>
    );
}

export default CompletionConditionEditor;
