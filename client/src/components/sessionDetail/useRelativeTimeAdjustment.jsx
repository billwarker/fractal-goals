import { useEffect, useRef, useState } from 'react';

import { isTextEditingElement } from '../../hooks/useModalBackdropDismiss';
import { applyRelativeTimeAdjustment } from '../../utils/dateUtils';
import Button from '../atoms/Button';
import styles from './SessionActivityItem.module.css';

export default function useRelativeTimeAdjustment({ timezone, validate, onApply }) {
    const [activeTarget, setActiveTarget] = useState(null);
    const [drafts, setDrafts] = useState({ start: '', stop: '' });
    const [errors, setErrors] = useState({ start: '', stop: '' });
    const panelRef = useRef(null);

    useEffect(() => {
        if (!activeTarget) return undefined;

        const handlePointerDown = (event) => {
            if (panelRef.current?.contains(event.target)) return;
            const activeElement = event.target?.ownerDocument?.activeElement;
            if (
                activeElement
                && panelRef.current?.contains(activeElement)
                && isTextEditingElement(activeElement)
            ) {
                activeElement.blur();
                return;
            }
            setActiveTarget(null);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [activeTarget]);

    const toggle = (event, target) => {
        event.stopPropagation();
        setActiveTarget((current) => (current === target ? null : target));
        setErrors((current) => ({ ...current, [target]: '' }));
    };

    const apply = (event, target, currentValue) => {
        event.stopPropagation();
        try {
            const isoValue = applyRelativeTimeAdjustment(currentValue, drafts[target], timezone);
            const rangeError = validate?.(target, isoValue) || '';
            if (rangeError) {
                setErrors((current) => ({ ...current, [target]: rangeError }));
                return;
            }
            onApply(target, isoValue);
            setActiveTarget(null);
            setDrafts((current) => ({ ...current, [target]: '' }));
            setErrors((current) => ({ ...current, [target]: '' }));
        } catch (error) {
            setErrors((current) => ({
                ...current,
                [target]: error?.message || 'Use +10M, -2H, or +30S',
            }));
        }
    };

    const renderToggle = (target) => (
        <button
            type="button"
            className={styles.timeAdjustmentToggle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => toggle(event, target)}
            aria-expanded={activeTarget === target}
            aria-label={`Adjust ${target} time`}
            title={`Adjust ${target} time`}
        >
            ±
        </button>
    );

    const renderPanel = (target, currentValue) => {
        if (activeTarget !== target) return null;
        return (
            <div
                ref={panelRef}
                className={styles.timeAdjustmentPanel}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.timeAdjustmentControls}>
                    <input
                        type="text"
                        inputMode="text"
                        aria-label={`Relative ${target} adjustment`}
                        placeholder="+10M"
                        value={drafts[target]}
                        onChange={(event) => {
                            setDrafts((current) => ({ ...current, [target]: event.target.value }));
                            setErrors((current) => ({ ...current, [target]: '' }));
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') apply(event, target, currentValue);
                            if (event.key === 'Escape') {
                                event.stopPropagation();
                                setActiveTarget(null);
                            }
                        }}
                        className={`${styles.timeAdjustmentInput} ${errors[target] ? styles.timerInputError : ''}`}
                    />
                    <Button
                        size="sm"
                        variant="secondary"
                        className={styles.timeAdjustmentApplyButton}
                        onClick={(event) => apply(event, target, currentValue)}
                    >
                        Apply
                    </Button>
                </div>
                {errors[target] && (
                    <div className={styles.timeAdjustmentValidation}>{errors[target]}</div>
                )}
            </div>
        );
    };

    return { activeTarget, renderToggle, renderPanel };
}
