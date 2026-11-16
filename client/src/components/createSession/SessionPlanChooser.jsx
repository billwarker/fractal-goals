import React, { useMemo, useState } from 'react';

import { useSessionPlanCandidates } from '../../hooks/useProgramSessionPlans';
import { formatLiteralDate } from '../../utils/dateUtils';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './SessionPlanChooser.module.css';

const TEMPLATE_ONLY = 'template';
// Older plans stay on offer but are never picked for you.
const DEFAULT_PLAN_MAX_AGE_DAYS = 14;

function daysBetween(earlierISO, laterISO) {
    return Math.round((Date.parse(laterISO) - Date.parse(earlierISO)) / 86400000);
}

function candidateValue(candidate) {
    return `${candidate.program_day_id}:${candidate.date}`;
}

function candidateLabel(candidate, showDayName) {
    const when = candidate.is_today
        ? 'Today'
        : formatLiteralDate(candidate.date, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
    const state = candidate.executed ? ' · already done' : candidate.is_today ? '' : ' · not yet done';
    return `${when}${showDayName ? ` · ${candidate.program_day_name}` : ''}${state}`;
}

/**
 * Chooses which dated plan (if any) a new session of `template` executes. When a
 * program day is selected, only that day's plans are offered, because the session
 * is linked to it. Defaults to today's unexecuted plan, else the latest recent unexecuted one.
 * A chosen previous day (`preferLatest`) instead defaults to its newest plan, even if already run.
 */
export function useSessionPlanChoice(rootId, template, todayISO, programDayId = null, preferLatest = false) {
    const enabled = Boolean(template);
    const query = useSessionPlanCandidates(rootId, enabled ? template.id : null, todayISO);
    const candidates = useMemo(() => (query.data?.candidates || []).filter((candidate) => (
        !programDayId || String(candidate.program_day_id) === String(programDayId)
    )), [programDayId, query.data]);
    const defaultValue = useMemo(() => {
        if (preferLatest) return candidates[0] ? candidateValue(candidates[0]) : TEMPLATE_ONLY;
        const fresh = candidates.find((candidate) => (
            !candidate.executed && daysBetween(candidate.date, todayISO) <= DEFAULT_PLAN_MAX_AGE_DAYS
        ));
        return fresh ? candidateValue(fresh) : TEMPLATE_ONLY;
    }, [candidates, preferLatest, todayISO]);
    const [choice, setChoice] = useState(null);
    const value = choice && (choice === TEMPLATE_ONLY || candidates.some((c) => candidateValue(c) === choice))
        ? choice
        : defaultValue;
    const selected = candidates.find((candidate) => candidateValue(candidate) === value) || null;
    const payload = !selected
        ? {}
        : selected.plan_id
            ? { program_session_plan_id: selected.plan_id }
            : { plan_ref: { program_day_id: selected.program_day_id, date: selected.date } };
    return { candidates, value, onChange: setChoice, payload, loading: query.isLoading };
}

/** Step 3 of Create Session, after a program day or template: which dated plan to run. */
export default function SessionPlanChooser(props) {
    const content = renderChooser(props);
    if (!content) return null;
    return (
        <StepContainer className={styles.container}>
            <StepHeader stepNumber={3} title="Select a Plan" />
            {content}
        </StepContainer>
    );
}

function renderChooser({ candidates, value, onChange, loading = false, emptyMessage = null }) {
    if (!candidates.length) {
        if (loading || !emptyMessage) return null;
        return (
            <div className={styles.chooser}>
                <span className={styles.label}>Plan</span>
                <span className={styles.hint}>{emptyMessage}</span>
            </div>
        );
    }
    const previous = candidates.filter((candidate) => !candidate.is_today);
    // A chosen program day narrows the options to itself, so its name would only repeat.
    const showDayName = new Set(candidates.map((candidate) => String(candidate.program_day_id))).size > 1;
    const optionFor = (candidate) => (
        <option key={candidateValue(candidate)} value={candidateValue(candidate)}>
            {candidateLabel(candidate, showDayName)}
        </option>
    );
    return (
        <label className={styles.chooser}>
            <span className={styles.label}>Plan</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {candidates.filter((candidate) => candidate.is_today).map(optionFor)}
                {previous.length ? <optgroup label="Previous plans">{previous.map(optionFor)}</optgroup> : null}
                <option value={TEMPLATE_ONLY}>Template only (no planned values from a program)</option>
            </select>
            <span className={styles.hint}>Planned values appear beside each activity as a reference.</span>
        </label>
    );
}
