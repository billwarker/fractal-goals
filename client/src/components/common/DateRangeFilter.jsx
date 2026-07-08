import React, { useMemo, useState } from 'react';

import {
    DATE_PRESET_OPTIONS,
    getMatchingPreset,
    presetToRange,
} from '../../utils/dateRange';
import styles from './DateRangeFilter.module.css';

/**
 * Preset-chip + custom-range date filter shared by the analytics filters
 * sidebar and the admin usage dashboard.
 *
 * `classNames` lets a host surface substitute its own CSS classes (the
 * analytics sidebar passes its `sessions-query-*` classes so it stays
 * pixel-identical); otherwise the component's own module styles apply.
 */
function DateRangeFilter({
    value,
    onChange,
    presets = DATE_PRESET_OPTIONS.map((option) => option.value),
    classNames = {},
}) {
    const cx = {
        chipGroup: classNames.chipGroup ?? styles.chipGroup,
        chip: classNames.chip ?? styles.chip,
        chipActive: classNames.chipActive ?? styles.chipActive,
        dateGrid: classNames.dateGrid ?? styles.dateGrid,
        field: classNames.field ?? styles.field,
    };

    const options = useMemo(
        () => DATE_PRESET_OPTIONS.filter((option) => presets.includes(option.value)),
        [presets],
    );

    const derivedPreset = useMemo(() => getMatchingPreset(value), [value]);
    // Sticky: once the user picks Custom, keep the custom inputs visible even
    // if the chosen dates happen to match a preset span.
    const [isCustomPresetSelected, setIsCustomPresetSelected] = useState(derivedPreset === 'custom');
    const selectedPreset = (!value?.start && !value?.end)
        ? 'all'
        : isCustomPresetSelected ? 'custom' : derivedPreset;

    const handlePresetClick = (option) => {
        setIsCustomPresetSelected(option.value === 'custom');
        if (option.value === 'custom') {
            if (!value?.start && !value?.end) {
                onChange?.(presetToRange('30d'));
            }
            return;
        }
        onChange?.(presetToRange(option.value));
    };

    return (
        <>
            <div className={cx.chipGroup}>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`${cx.chip} ${selectedPreset === option.value ? cx.chipActive : ''}`}
                        onClick={() => handlePresetClick(option)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {selectedPreset === 'custom' && (
                <div className={cx.dateGrid}>
                    <label className={cx.field}>
                        <span>Start</span>
                        <input
                            type="date"
                            value={value?.start || ''}
                            onChange={(event) => onChange?.({
                                ...value,
                                start: event.target.value || null,
                            })}
                        />
                    </label>
                    <label className={cx.field}>
                        <span>End</span>
                        <input
                            type="date"
                            value={value?.end || ''}
                            onChange={(event) => onChange?.({
                                ...value,
                                end: event.target.value || null,
                            })}
                        />
                    </label>
                </div>
            )}
        </>
    );
}

export default DateRangeFilter;
