import { useEffect, useRef } from 'react';

import { useTimezone } from '../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../utils/dateUtils';
import { addInterval } from '../utils/goalDeadlineRules';

/**
 * Creating a goal: start its due date at the level's default horizon (e.g. a Mid Term goal in
 * 3 months). It follows the chosen level while the field still holds that default, and never
 * replaces a date the user typed or cleared.
 */
export default function useLevelDefaultDeadline({ mode, levelConfig, deadline, setDeadline }) {
    const { timezone } = useTimezone();
    const prefilledRef = useRef(null);
    const value = levelConfig?.default_deadline_offset_value;
    const unit = levelConfig?.default_deadline_offset_unit;

    useEffect(() => {
        if (mode !== 'create' || !value || !unit) return;
        const untouched = deadline === '' ? prefilledRef.current === null : deadline === prefilledRef.current;
        if (!untouched) return;
        const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
        const next = addInterval(today, value, unit);
        if (next && next !== deadline) {
            prefilledRef.current = next;
            setDeadline(next);
        }
    // setDeadline is recreated each render by useGoalForm; the inputs that matter are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deadline, mode, timezone, unit, value]);
}
