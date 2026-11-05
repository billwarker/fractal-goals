import React, { useState } from 'react';

import EditIcon from '../atoms/EditIcon';
import IconButton from '../atoms/IconButton';
import ChartTitle from './ChartTitle';
import { getChartTitle } from './chartTitles';
import { getVisualization } from './visualizations/registry';
import styles from './ChartTitle.module.css';

// Inside a draggable pane header, pointer presses on the control must not start a drag.
const stopDrag = (event) => event.stopPropagation();

/** A chart's numbered title with a pencil to rename it; an empty or default name restores the default. */
export default function ChartTitleEditor({ number, windowState, onRename }) {
    // The name being typed while renaming; null when not renaming.
    const [draft, setDraft] = useState(null);
    const defaultName = getVisualization(windowState?.selectedCategory, windowState?.selectedVisualization)?.name;
    const title = getChartTitle(windowState);

    const commit = () => {
        const next = draft?.trim() || '';
        onRename(next && next !== defaultName ? next : null);
        setDraft(null);
    };

    if (draft !== null) {
        return (
            <input
                className={styles.input}
                value={draft}
                placeholder={defaultName}
                aria-label="Chart name"
                maxLength={80}
                autoFocus
                onFocus={(event) => event.target.select()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') commit();
                    if (event.key === 'Escape') setDraft(null);
                }}
                onMouseDown={stopDrag}
                onClick={stopDrag}
            />
        );
    }
    return (
        <span className={styles.editor}>
            <ChartTitle number={number} name={title} />
            <IconButton
                className={styles.renameButton}
                size="sm"
                aria-label={`Rename ${title}`}
                title="Rename chart"
                onMouseDown={stopDrag}
                onClick={(event) => {
                    event.stopPropagation();
                    setDraft(title);
                }}
            >
                <EditIcon size={13} />
            </IconButton>
        </span>
    );
}
