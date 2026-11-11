import React from 'react';

import { REVIEW_CADENCE_UNITS } from '../utils/goalReview';
import Switch from './atoms/Switch';
import { SettingsRow, rowDescriptionId } from './settings/SettingsSection';
import controls from './settings/SettingsControls.module.css';
import styles from './GoalCharacteristicsSettings.module.css';

/**
 * A level's review defaults: whether its goals are reviewed (SMART's R) and how often
 * (blank = no reviews by default).
 */
export default function GoalLevelReviewSettings({ current, onChange, idPrefix }) {
    const usesReviews = Boolean(current.uses_reviews);
    const setCadence = (value, unit) => {
        onChange('review_cadence_value', value);
        onChange('review_cadence_unit', value == null ? null : unit);
    };
    return (
        <>
            <SettingsRow
                label="Review goals at this level"
                description="Goals here get periodic reviews (SMART's R)."
                controlId={`${idPrefix}-reviews`}
            >
                <Switch
                    id={`${idPrefix}-reviews`}
                    aria-describedby={rowDescriptionId(`${idPrefix}-reviews`)}
                    checked={usesReviews}
                    onChange={(checked) => onChange('uses_reviews', checked)}
                />
            </SettingsRow>
            <SettingsRow
                label="Review every"
                description="Leave blank for no review schedule by default."
                controlId={`${idPrefix}-review-every`}
            >
                <span className={styles.amount}>
                    <input
                        id={`${idPrefix}-review-every`}
                        aria-describedby={rowDescriptionId(`${idPrefix}-review-every`)}
                        type="number"
                        inputMode="numeric"
                        placeholder="—"
                        min="1"
                        disabled={!usesReviews}
                        value={current.review_cadence_value ?? ''}
                        onChange={(event) => setCadence(
                            event.target.value ? Math.max(1, parseInt(event.target.value, 10)) : null,
                            current.review_cadence_unit || 'months',
                        )}
                        className={`${controls.input} ${controls.number}`}
                    />
                    <select
                        disabled={!usesReviews || current.review_cadence_value == null}
                        aria-label="Review interval unit"
                        value={current.review_cadence_unit ?? 'months'}
                        onChange={(event) => setCadence(current.review_cadence_value, event.target.value)}
                        className={`${controls.select} ${styles.unit}`}
                    >
                        {REVIEW_CADENCE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                </span>
            </SettingsRow>
        </>
    );
}
