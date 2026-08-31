import PropTypes from 'prop-types';
import React from 'react';

import styles from './ManageMetricsModal.module.css';

const INPUT_TYPES = [
    { value: 'number', label: 'Number (decimal)' },
    { value: 'integer', label: 'Integer (whole)' },
    { value: 'duration', label: 'Duration (MM:SS)' },
];

export const defaultPrecisionForType = (inputType) => (inputType === 'number' ? 2 : 0);

export default function MetricInputSettingsFields({ form, setField, setInputType }) {
    return (
        <>
            <div className={styles.formRow}>
                <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="metric-input-type">Input type</label>
                    <select
                        id="metric-input-type"
                        className={styles.select}
                        value={form.input_type}
                        onChange={(event) => setInputType(event.target.value)}
                    >
                        {INPUT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="metric-precision">Precision</label>
                    <select
                        id="metric-precision"
                        className={styles.select}
                        value={form.precision}
                        onChange={(event) => setField('precision', Number(event.target.value))}
                        disabled={form.input_type === 'integer'}
                        aria-describedby="metric-precision-hint"
                    >
                        {[0, 1, 2, 3, 4, 5, 6].map((places) => (
                            <option key={places} value={places}>
                                {places} decimal {places === 1 ? 'place' : 'places'}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div id="metric-precision-hint" className={styles.inputHint}>
                Controls decimal places shown and accepted. Integer metrics always use 0.
            </div>
        </>
    );
}

MetricInputSettingsFields.propTypes = {
    form: PropTypes.shape({
        input_type: PropTypes.string.isRequired,
        precision: PropTypes.number.isRequired,
    }).isRequired,
    setField: PropTypes.func.isRequired,
    setInputType: PropTypes.func.isRequired,
};
