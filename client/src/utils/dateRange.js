/**
 * Shared date-range preset logic used by the analytics filters sidebar and
 * the admin usage dashboard. Ranges are `{ start, end }` ISO `yyyy-mm-dd`
 * strings (or null for an unbounded side); dates are UTC-anchored via
 * toISOString to match the original analytics behavior.
 */
export const DATE_PRESET_OPTIONS = [
    { value: '7d', label: '7D', days: 7 },
    { value: '30d', label: '30D', days: 30 },
    { value: '90d', label: '90D', days: 90 },
    { value: '6m', label: '6M', days: 182 },
    { value: '1y', label: '1Y', days: 365 },
    { value: 'all', label: 'All', days: null },
    { value: 'custom', label: 'Custom', days: null },
];

export function toISODate(date) {
    return date.toISOString().split('T')[0];
}

export function getMatchingPreset(dateRange) {
    if (!dateRange?.start && !dateRange?.end) {
        return 'all';
    }
    if (!dateRange?.start || !dateRange?.end) {
        return 'custom';
    }

    const today = toISODate(new Date());
    if (dateRange.end !== today) {
        return 'custom';
    }

    for (const preset of DATE_PRESET_OPTIONS) {
        if (!preset.days) continue;
        const presetStart = new Date();
        presetStart.setDate(presetStart.getDate() - (preset.days - 1));
        if (dateRange.start === toISODate(presetStart)) {
            return preset.value;
        }
    }

    return 'custom';
}

export function presetToRange(presetValue) {
    const preset = DATE_PRESET_OPTIONS.find((option) => option.value === presetValue);
    if (!preset || preset.value === 'all') {
        return { start: null, end: null };
    }

    const days = preset.days ?? 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return { start: toISODate(start), end: toISODate(end) };
}
