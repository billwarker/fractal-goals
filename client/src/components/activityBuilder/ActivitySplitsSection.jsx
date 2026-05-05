import React from 'react';

import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import Input from '../atoms/Input';
import styles from '../ActivityBuilder.module.css';

function ActivitySplitsSection({
    splits,
    onAddSplit,
    onRemoveSplit,
    onSplitChange,
}) {
    return (
        <div>
            <label className={styles.label} style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Splits (Min 2, Max 5)
            </label>
            <div className={styles.splitsContainer}>
                {splits.map((split, idx) => (
                    <div key={idx} className={styles.splitRow}>
                        <Input
                            value={split.name}
                            onChange={(event) => onSplitChange(idx, event.target.value)}
                            placeholder={`Split #${idx + 1}`}
                            style={{ marginBottom: 0, width: '200px' }}
                        />
                        {splits.length > 2 && (
                            <Button
                                type="button"
                                onClick={() => onRemoveSplit(idx)}
                                variant="ghost"
                                style={{ color: 'var(--color-brand-danger)', padding: '8px' }}
                                aria-label="Remove split"
                            >
                                <CloseIcon size={14} />
                            </Button>
                        )}
                        {idx === splits.length - 1 && splits.length < 5 && (
                            <Button
                                type="button"
                                onClick={onAddSplit}
                                variant="secondary"
                                size="sm"
                            >
                                + Add Split
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default ActivitySplitsSection;
