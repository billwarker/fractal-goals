import React from 'react';

import Button from '../atoms/Button';
import styles from './MetricCascadeButton.module.css';


export default function MetricCascadeButton({
    value,
    unit,
    destinationLabel,
    onClick,
    disabled = false,
}) {
    const displayUnit = unit || 'Value';
    const titleUnit = unit ? ` ${unit}` : '';

    return (
        <Button
            unstyled
            type="button"
            className={styles.button}
            disabled={disabled}
            onClick={onClick}
            title={`Copy ${value}${titleUnit} to subsequent empty ${destinationLabel}`}
        >
            Cascade {displayUnit}
        </Button>
    );
}
