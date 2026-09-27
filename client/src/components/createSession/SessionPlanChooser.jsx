import React, { useMemo, useState } from 'react';

import { useSessionPlanCandidates } from '../../hooks/useProgramSessionPlans';
import { formatLiteralDate } from '../../utils/dateUtils';
import { isQuickSession } from '../../utils/sessionRuntime';
import styles from './SessionPlanChooser.module.css';

const TEMPLATE_ONLY = 'template';

function candidateValue(candidate) {
    return `${candidate.program_day_id}:${candidate.date}`;
}

function candidateLabel(candidate) {
    const when = candidate.is_today
        ? 'Today'
        : formatLiteralDate(candidate.date, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
    const state = candidate.executed ? ' · already done' : candidate.is_today ? '' : ' · not yet done';
    return `${when} · ${candidate.program_day_name}${state}`;
}

/**
 * Chooses which dated plan (if any) a new session of `template` executes. When a
 * program day is selected, only that day's plans are offered, because the session
 * is linked to it. Defaults to today's unexecuted plan, else the latest unexecuted one.
 */
export function useSessionPlanChoice(rootId, template, todayISO, programDayId = null) {
    const enabled = Boolean(template && !isQuickSession(template));
    const query = useSessionPlanCandidates(rootId, enabled ? template.id : null, todayISO);
    const candidates = useMemo(() => (query.data?.candidates || []).filter((candidate) => (
        !programDayId || String(candidate.program_day_id) === String(programDayId)
    )), [programDayId, query.data]);
    const defaultValue = useMemo(() => {
        const fresh = candidates.find((candidate) => !candidate.executed);
        return fresh ? candidateValue(fresh) : TEMPLATE_ONLY;
    }, [candidates]);
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
    return { candidates, value, onChange: setChoice, payload };
}

export default function SessionPlanChooser({ candidates, value, onChange }) {
    if (!candidates.length) return null;
    return (
        <label className={styles.chooser}>
            <span className={styles.label}>Plan</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {candidates.map((candidate) => (
                    <option key={candidateValue(candidate)} value={candidateValue(candidate)}>
                        {candidateLabel(candidate)}
                    </option>
                ))}
                <option value={TEMPLATE_ONLY}>Template only (no planned values from a program)</option>
            </select>
            <span className={styles.hint}>Planned values appear beside each activity as a reference.</span>
        </label>
    );
}
