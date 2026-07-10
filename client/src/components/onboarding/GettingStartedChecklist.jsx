import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '../atoms/Button';
import { ChevronRightIcon } from '../atoms/AppIcons';
import IconButton from '../atoms/IconButton';
import { useOnboarding } from '../../contexts/OnboardingContext';
import notify from '../../utils/notify';
import styles from './GettingStartedChecklist.module.css';

export default function GettingStartedChecklist({ inline = false }) {
    const navigate = useNavigate();
    const { enabled, state, steps, completedCount, dismiss, resume, isLoading } = useOnboarding();
    const [expanded, setExpanded] = useState(() => {
        if (inline) return true;
        try { return localStorage.getItem('fg:onboarding-checklist-collapsed') !== 'true'; } catch { return true; }
    });
    const [currentStepIndex, setCurrentStepIndex] = useState(() => {
        const firstIncomplete = steps.findIndex((step) => !step.done);
        return firstIncomplete === -1 ? Math.max(0, steps.length - 1) : firstIncomplete;
    });
    const previousDoneById = useRef(Object.fromEntries(steps.map((step) => [step.id, step.done])));
    useEffect(() => {
        setCurrentStepIndex((currentIndex) => {
            if (steps.length === 0) return 0;
            const safeIndex = Math.min(currentIndex, steps.length - 1);
            const currentStep = steps[safeIndex];
            const wasJustCompleted = previousDoneById.current[currentStep.id] === false && currentStep.done;
            if (!wasJustCompleted) return safeIndex;
            const nextIncomplete = steps.findIndex((step, index) => index > safeIndex && !step.done);
            if (nextIncomplete !== -1) return nextIncomplete;
            const firstIncomplete = steps.findIndex((step) => !step.done);
            return firstIncomplete === -1 ? safeIndex : firstIncomplete;
        });
        previousDoneById.current = Object.fromEntries(steps.map((step) => [step.id, step.done]));
    }, [steps]);
    const toggleExpanded = () => {
        if (inline) return;
        setExpanded((value) => {
            const next = !value;
            try { localStorage.setItem('fg:onboarding-checklist-collapsed', String(!next)); } catch { /* optional preference */ }
            return next;
        });
    };
    const handleDismiss = async () => {
        await dismiss();
        const toastId = notify.custom(
            <div className={styles.undoToast}>Getting Started hidden.<Button size="sm" variant="ghost" onClick={() => { notify.dismiss(toastId); resume(); }}>Undo</Button></div>
        );
    };
    if (!enabled || isLoading || state?.status !== 'active') return null;
    const currentStep = steps[currentStepIndex];

    return (
        <aside className={`${styles.checklist} ${inline ? styles.inline : styles.floating} ${expanded ? styles.expanded : ''}`} aria-label="Getting started">
            <button type="button" className={styles.summary} onClick={toggleExpanded} aria-expanded={expanded}>
                <span className={styles.progress} aria-hidden="true">{completedCount}/{steps.length}</span>
                <span>Getting started</span>
            </button>
            {expanded && (
                <div className={styles.body}>
                    {currentStep && (
                        <ol className={styles.steps} aria-live="polite">
                            <li key={currentStep.id} className={currentStep.done ? styles.done : ''}>
                                <span className={styles.mark} aria-hidden="true">{currentStep.done ? '✓' : '○'}</span>
                                <div><strong>{currentStep.title}</strong><p>{currentStep.blurb}</p></div>
                                {!currentStep.done && <Button variant="ghost" size="sm" onClick={() => navigate(currentStep.path)}>Go</Button>}
                            </li>
                        </ol>
                    )}
                    <div className={styles.carouselFooter}>
                        <div className={styles.carouselControls}>
                            <IconButton
                                size="sm"
                                aria-label="Previous checklist item"
                                disabled={currentStepIndex === 0}
                                onClick={() => setCurrentStepIndex((index) => Math.max(0, index - 1))}
                            >
                                <ChevronRightIcon className={styles.previousIcon} size={16} />
                            </IconButton>
                            <span className={styles.stepPosition}>Step {currentStepIndex + 1} of {steps.length}</span>
                            <IconButton
                                size="sm"
                                aria-label="Next checklist item"
                                disabled={currentStepIndex >= steps.length - 1}
                                onClick={() => setCurrentStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                            >
                                <ChevronRightIcon size={16} />
                            </IconButton>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleDismiss}>Hide for now</Button>
                    </div>
                </div>
            )}
        </aside>
    );
}
