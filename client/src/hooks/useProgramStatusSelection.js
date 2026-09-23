import { useEffect, useRef, useState } from 'react';

import { subtractDaysToDateString } from '../utils/dateUtils';

/**
 * Multi-day calendar selection. ``selectableDayStates`` are every date inside the
 * selected program; day-status actions use only the scheduled subset
 * (``selectedScheduledDates``) while time off spans the whole selection.
 */
export function useProgramStatusSelection(selectableDayStates, selectionMode, setSelectionMode) {
    const [selectedStatusDates, setSelectedStatusDates] = useState([]);
    const selectionModeButtonRef = useRef(null);
    const selectionAnchorRef = useRef(null);

    const clearStatusSelection = () => {
        setSelectedStatusDates([]);
        selectionAnchorRef.current = null;
    };

    const setMultiDaySelectionMode = (enabled, { restoreFocus = true } = {}) => {
        setSelectionMode(enabled);
        clearStatusSelection();
        if (!enabled && restoreFocus) selectionModeButtonRef.current?.focus();
    };

    useEffect(() => {
        if (!selectionMode) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setSelectionMode(false);
            setSelectedStatusDates([]);
            selectionAnchorRef.current = null;
            selectionModeButtonRef.current?.focus();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectionMode, setSelectionMode]);

    const toggleStatusDate = (date, { extend = false } = {}) => {
        const eligibleDates = selectableDayStates.map((day) => day.date).sort();
        if (!eligibleDates.includes(date)) return;
        setSelectedStatusDates((current) => {
            const next = new Set(current);
            if (extend && selectionAnchorRef.current) {
                const start = [selectionAnchorRef.current, date].sort()[0];
                const end = [selectionAnchorRef.current, date].sort()[1];
                eligibleDates.filter((value) => value >= start && value <= end).forEach((value) => next.add(value));
            } else if (next.has(date)) {
                next.delete(date);
            } else {
                next.add(date);
            }
            return [...next].sort();
        });
        selectionAnchorRef.current = date;
    };

    const selectStatusRange = (info) => {
        const start = info.startStr;
        const end = subtractDaysToDateString(info.endStr, 1);
        setSelectedStatusDates((current) => [...new Set([
            ...current,
            ...selectableDayStates.filter((day) => day.date >= start && day.date <= end).map((day) => day.date),
        ])].sort());
        selectionAnchorRef.current = start;
    };

    const scheduledDates = new Set(selectableDayStates.filter((day) => day.scheduled).map((day) => day.date));
    const selectedScheduledDates = selectedStatusDates.filter((date) => scheduledDates.has(date));

    return {
        selectedStatusDates,
        selectedScheduledDates,
        selectionModeButtonRef,
        setMultiDaySelectionMode,
        clearStatusSelection,
        toggleStatusDate,
        selectStatusRange,
    };
}
