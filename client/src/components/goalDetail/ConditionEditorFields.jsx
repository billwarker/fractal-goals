import React, { useState } from 'react';

import Input from '../atoms/Input';
import Select from '../atoms/Select';
import ViewToggleTabs from '../common/ViewToggleTabs';
import ActivityTagEditor from '../sessionDetail/ActivityTagEditor';
import { OPERATOR_SYMBOLS, RULE_OPERATORS, inferOperator } from '../../utils/goalConditions';
import { displayUnit } from '../../utils/goalConditionText';
import styles from './CompletionConditionEditor.module.css';

const SET_AGGREGATE_ITEMS = [{ value: 'each', label: 'Best' }, { value: 'average', label: 'Average' }];
const TAG_MATCH_ITEMS = [{ value: 'contains', label: 'Containing' }, { value: 'exact', label: 'Exactly' }];

export function OperatorSelect({ value, operators, onChange, label }) {
    return (
        <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
            {operators.map((operator) => (
                <option key={operator} value={operator}>{OPERATOR_SYMBOLS[operator]}</option>
            ))}
        </Select>
    );
}

/** Best: each counted set meets the rules. Average: the session's counted sets meet them on average. */
export function SetAggregateToggle({ value, onChange }) {
    return (
        <ViewToggleTabs
            items={SET_AGGREGATE_ITEMS}
            value={value === 'average' ? 'average' : 'each'}
            onChange={onChange}
            ariaLabel="Best or average"
            className={styles.aggregateToggle}
        />
    );
}

export function RuleRow({ rule, index, metrics, usedMetricIds, error, onChange, onRemove, canRemove, best = null }) {
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
                    placeholder={best != null ? `Best ${best}` : undefined}
                    aria-label={`Rule ${index + 1} value`}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => onChange({ ...rule, value: event.target.value })}
                />
                {displayUnit(metric) ? <span className={styles.unit}>{displayUnit(metric)}</span> : null}
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

/**
 * "Only count when tagged": tags every counted set must carry (sets inherit their activity's
 * tags). The session page's tag picker in controlled mode: picks land in the draft, nothing is
 * assigned, and a tag created here joins the catalog.
 */
export function ConditionTagFilter({ rootId, activityId, tagIds, tagMatch, usesSets, error, onChange, onTagMatchChange }) {
    // Opted in while the box is ticked, even before a tag is picked; unticking drops the tags.
    const [enabled, setEnabled] = useState(tagIds.length > 0);
    const on = enabled || tagIds.length > 0;
    const exact = tagMatch === 'exact';
    const leading = (
        <>
            <label className={styles.checkRow}>
                <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => {
                        setEnabled(event.target.checked);
                        if (!event.target.checked && tagIds.length) onChange([]);
                    }}
                />
                <span>{usesSets ? 'Only count sets when tagged' : 'Only count when tagged'}</span>
            </label>
            {on ? (
                <ViewToggleTabs
                    items={TAG_MATCH_ITEMS}
                    value={exact ? 'exact' : 'contains'}
                    onChange={onTagMatchChange}
                    ariaLabel="Containing or exactly these tags"
                    className={styles.aggregateToggle}
                />
            ) : null}
        </>
    );
    const subject = usesSets ? 'sets with' : 'sessions where the activity has';
    return (
        <div className={styles.tagRow}>
            {/* Always mounted (the checkbox lives in it), so ticking keeps focus; unticked hides the trigger.
                The chosen tags show in the threshold's summary, not here. */}
            <ActivityTagEditor
                rootId={rootId}
                activityId={activityId}
                selectedTagIds={tagIds}
                onChangeTags={onChange}
                scopeLabel="Required tags"
                editable={on}
                leading={leading}
                showSelected={false}
            />
            {on ? (
                <p className={styles.hint}>
                    {exact
                        ? `Only ${subject} exactly the chosen tags, and no others, count.`
                        : `Only ${subject} every chosen tag (others allowed) count.`}
                    {usesSets ? ' Tags on the activity apply to its sets.' : ''}
                </p>
            ) : null}
            {error ? <span className={styles.error} role="alert">{error}</span> : null}
        </div>
    );
}
