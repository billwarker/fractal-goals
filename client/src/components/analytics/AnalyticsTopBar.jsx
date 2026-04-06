import React, { useEffect, useMemo, useState } from 'react';

import Button from '../atoms/Button';
import styles from './AnalyticsTopBar.module.css';

const DATE_PRESETS = [
    { value: '7d', label: '7D', days: 7 },
    { value: '30d', label: '30D', days: 30 },
    { value: '90d', label: '90D', days: 90 },
    { value: '6m', label: '6M', days: 182 },
    { value: '1y', label: '1Y', days: 365 },
    { value: 'all', label: 'All', days: null },
    { value: 'custom', label: 'Custom', days: null },
];

function toISODate(date) {
    return date.toISOString().split('T')[0];
}

function getMatchingPreset(dateRange) {
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

    for (const preset of DATE_PRESETS) {
        if (!preset.days) {
            continue;
        }
        const presetStart = new Date();
        presetStart.setDate(presetStart.getDate() - preset.days);
        if (dateRange.start === toISODate(presetStart)) {
            return preset.value;
        }
    }

    return 'custom';
}

function AnalyticsTopBar({
    currentViewName = 'Empty View',
    onOpenViewsModal,
    onSaveView,
    dateRange,
    onDateRangeChange,
}) {
    const derivedPreset = useMemo(() => getMatchingPreset(dateRange), [dateRange]);
    const [selectedPreset, setSelectedPreset] = useState(derivedPreset);

    useEffect(() => {
        if (!dateRange?.start && !dateRange?.end) {
            setSelectedPreset('all');
            return;
        }

        setSelectedPreset((currentPreset) => (
            currentPreset === 'custom' ? 'custom' : derivedPreset
        ));
    }, [dateRange, derivedPreset]);

    const handlePresetClick = (preset) => {
        setSelectedPreset(preset.value);

        if (preset.value === 'all') {
            onDateRangeChange?.({ start: null, end: null });
            return;
        }

        if (preset.value === 'custom') {
            if (!dateRange?.start && !dateRange?.end) {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                onDateRangeChange?.({ start: toISODate(start), end: toISODate(end) });
            }
            return;
        }
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - preset.days);
        onDateRangeChange?.({ start: toISODate(start), end: toISODate(end) });
    };

    return (
        <div className={styles.topBar}>
            <div className={styles.viewSection}>
                <div className={styles.viewMeta}>
                    <h1 className={styles.pageTitle}>{currentViewName}</h1>
                </div>
                <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={onOpenViewsModal}>
                        Other Views
                    </Button>
                    <Button variant="primary" size="sm" onClick={onSaveView}>
                        Save View
                    </Button>
                </div>
            </div>

            <div className={styles.filtersSection}>
                <span className={styles.sectionLabel}>Time Range</span>
                <div className={styles.presetRow}>
                    {DATE_PRESETS.map((preset) => (
                        <button
                            key={preset.value}
                            type="button"
                            className={`${styles.presetBtn} ${selectedPreset === preset.value ? styles.presetBtnActive : ''}`}
                            onClick={() => handlePresetClick(preset)}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
                {selectedPreset === 'custom' && (
                    <div className={styles.dateInputs}>
                        <label className={styles.dateField}>
                            <span>Start</span>
                            <input
                                type="date"
                                value={dateRange?.start || ''}
                                onChange={(event) => onDateRangeChange?.({
                                    ...dateRange,
                                    start: event.target.value || null,
                                })}
                            />
                        </label>
                        <label className={styles.dateField}>
                            <span>End</span>
                            <input
                                type="date"
                                value={dateRange?.end || ''}
                                onChange={(event) => onDateRangeChange?.({
                                    ...dateRange,
                                    end: event.target.value || null,
                                })}
                            />
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AnalyticsTopBar;
