import React from 'react';

import { PinIcon } from '../atoms/AppIcons';
import styles from './PinBadge.module.css';

/** The one mark for a note pinned to next time, wherever notes appear: a pin and what it's pinned to. */
export default function PinBadge({ children }) {
    return (
        <span className={styles.badge}>
            <PinIcon size={12} strokeWidth={2.25} aria-hidden="true" focusable="false" />
            <span>{children}</span>
        </span>
    );
}
