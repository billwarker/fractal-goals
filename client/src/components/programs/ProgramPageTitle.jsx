import React from 'react';

import useReadableColor from '../../hooks/useReadableColor';
import styles from './ProgramPageTitle.module.css';

/**
 * The Programs page title: program • block • date, each name in its own colour made readable as
 * text in the current theme.
 */
function ProgramPageTitle({ program, block, dateLabel }) {
    const programColor = useReadableColor(program?.color, 'text');
    const blockColor = useReadableColor(block?.color || 'var(--color-brand-primary)', 'text');
    const parts = [
        program ? { key: 'program', label: program.name, color: program.color ? programColor : undefined } : null,
        block ? { key: 'block', label: block.name, color: blockColor } : null,
        { key: 'date', label: dateLabel },
    ].filter(Boolean);

    return (
        <span className={styles.segments}>
            {parts.map((part, index) => (
                <React.Fragment key={part.key}>
                    {index > 0 ? <span className={styles.separator}>•</span> : null}
                    <span className={styles.segment} style={part.color ? { color: part.color } : undefined}>
                        {part.label}
                    </span>
                </React.Fragment>
            ))}
        </span>
    );
}

export default ProgramPageTitle;
