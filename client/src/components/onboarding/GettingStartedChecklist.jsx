import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '../atoms/Button';
import { ChevronRightIcon } from '../atoms/AppIcons';
import IconButton from '../atoms/IconButton';
import ConfirmationModal from '../ConfirmationModal';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import { useOnboarding } from '../../contexts/OnboardingContext';
import styles from './GettingStartedChecklist.module.css';

const preferenceKey = (rootId, name) => `fg:onboarding:${rootId || 'global'}:${name}`;
const readPreference = (rootId, name, fallback) => {
    try { const value = localStorage.getItem(preferenceKey(rootId, name)); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
};

export default function GettingStartedChecklist({ inline = false }) {
    const navigate = useNavigate();
    const { enabled, state, steps, completedCount, dismiss, rootId, isLoading } = useOnboarding();
    const [expanded, setExpanded] = useState(() => {
        if (inline) return true;
        return !readPreference(rootId, 'collapsed', false);
    });
    const [currentStepIndex, setCurrentStepIndex] = useState(() => {
        const stored = readPreference(rootId, 'step', null);
        if (Number.isInteger(stored) && stored >= 0 && stored < steps.length) return stored;
        const firstIncomplete = steps.findIndex((step) => !step.done);
        return firstIncomplete === -1 ? Math.max(0, steps.length - 1) : firstIncomplete;
    });
    const [detailsOpen, setDetailsOpen] = useState(() => !inline && readPreference(rootId, 'details', false));
    const [confirmDismiss, setConfirmDismiss] = useState(false);
    const previousDoneById = useRef(Object.fromEntries(steps.map((step) => [step.id, step.done])));
    useEffect(() => {
        if (inline) return;
        setExpanded(!readPreference(rootId, 'collapsed', false));
        setDetailsOpen(readPreference(rootId, 'details', false));
        const storedStep = readPreference(rootId, 'step', null);
        const firstIncomplete = steps.findIndex((step) => !step.done);
        setCurrentStepIndex(Number.isInteger(storedStep) && storedStep >= 0 && storedStep < steps.length
            ? storedStep
            : firstIncomplete === -1 ? Math.max(0, steps.length - 1) : firstIncomplete);
    // Only restore preferences when the active fractal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inline, rootId]);
    useEffect(() => {
        setCurrentStepIndex((currentIndex) => {
            if (steps.length === 0) return 0;
            const safeIndex = Math.min(currentIndex, steps.length - 1);
            const currentStep = steps[safeIndex];
            const wasJustCompleted = previousDoneById.current[currentStep.id] === false && currentStep.done;
            if (!wasJustCompleted) return safeIndex;
            const nextIncomplete = steps.findIndex((step, index) => index > safeIndex && !step.done);
            if (nextIncomplete !== -1) { try { localStorage.setItem(preferenceKey(rootId, 'step'), JSON.stringify(nextIncomplete)); } catch { /* optional preference */ } return nextIncomplete; }
            const firstIncomplete = steps.findIndex((step) => !step.done);
            const nextIndex = firstIncomplete === -1 ? safeIndex : firstIncomplete;
            try { localStorage.setItem(preferenceKey(rootId, 'step'), JSON.stringify(nextIndex)); } catch { /* optional preference */ }
            return nextIndex;
        });
        previousDoneById.current = Object.fromEntries(steps.map((step) => [step.id, step.done]));
    }, [rootId, steps]);
    const setStep = (nextIndex) => {
        const safeIndex = Math.max(0, Math.min(steps.length - 1, nextIndex));
        setCurrentStepIndex(safeIndex);
        try { localStorage.setItem(preferenceKey(rootId, 'step'), JSON.stringify(safeIndex)); } catch { /* optional preference */ }
    };
    const toggleExpanded = () => {
        if (inline) return;
        setExpanded((value) => {
            const next = !value;
            try { localStorage.setItem(preferenceKey(rootId, 'collapsed'), JSON.stringify(!next)); } catch { /* optional preference */ }
            return next;
        });
    };
    const openDetails = () => {
        setExpanded(true);
        setDetailsOpen(true);
        try {
            localStorage.setItem(preferenceKey(rootId, 'collapsed'), 'false');
            localStorage.setItem(preferenceKey(rootId, 'details'), 'true');
        } catch { /* optional preference */ }
    };
    const closeDetails = () => {
        setDetailsOpen(false);
        try { localStorage.setItem(preferenceKey(rootId, 'details'), 'false'); } catch { /* optional preference */ }
    };
    if (!enabled || isLoading || state?.status !== 'active') return null;
    const currentStep = steps[currentStepIndex];

    return (
        <>
        <aside className={`${styles.checklist} ${inline ? styles.inline : styles.floating} ${expanded ? styles.expanded : styles.collapsed} ${detailsOpen ? styles.detailed : ''}`} aria-label="Getting started">
            <div className={styles.summary}>
                <button type="button" className={styles.summaryText} onClick={toggleExpanded} aria-expanded={expanded}>
                    <span>Getting started</span>{!expanded && currentStep && <small>{currentStep.title}</small>}
                </button>
                <button type="button" className={styles.progress} onClick={openDetails} aria-label="Open detailed onboarding guide" title={`${completedCount} of ${steps.length} steps complete`}>
                    <strong>{completedCount}/{steps.length}</strong>
                    <span>complete</span>
                </button>
            </div>
            {expanded && !detailsOpen && (
                <div className={styles.body}>
                    {currentStep && (
                        <ol className={styles.steps} aria-live="polite">
                            <li key={currentStep.id} className={currentStep.done ? styles.done : ''}>
                                <CompletionCheckBadge checked={currentStep.done} label={currentStep.done ? 'Step complete' : 'Step incomplete'} className={styles.mark} />
                                <div><strong>{currentStep.title}</strong><p>{currentStep.blurb}</p></div>
                                <Button variant="ghost" size="sm" onClick={openDetails}>Go</Button>
                            </li>
                        </ol>
                    )}
                    <div className={styles.carouselFooter}>
                        <div className={styles.carouselControls}>
                            <IconButton
                                size="sm"
                                aria-label="Previous checklist item"
                                disabled={currentStepIndex === 0}
                                onClick={() => setStep(currentStepIndex - 1)}
                            >
                                <ChevronRightIcon className={styles.previousIcon} size={16} />
                            </IconButton>
                            <span className={styles.stepPosition}>Step {currentStepIndex + 1} of {steps.length}</span>
                            <IconButton
                                size="sm"
                                aria-label="Next checklist item"
                                disabled={currentStepIndex >= steps.length - 1}
                                onClick={() => setStep(currentStepIndex + 1)}
                            >
                                <ChevronRightIcon size={16} />
                            </IconButton>
                        </div>
                        {!inline && <Button variant="ghost" size="sm" onClick={toggleExpanded}>Hide for now</Button>}
                    </div>
                </div>
            )}
            {expanded && detailsOpen && currentStep && (
                <div className={styles.detailBody}>
                    <div className={styles.detailHeader}>
                        <div className={styles.detailHeading}>
                            <span aria-label={`Step ${currentStep.number}`}>{currentStep.number}</span>
                            <h2>{currentStep.title}</h2>
                        </div>
                        <p>{currentStep.blurb}</p>
                    </div>
                    <ol className={styles.substeps}>
                        {currentStep.substeps.map((substep, index) => {
                            const letter = String.fromCharCode(97 + index);
                            const status = substep.kind === 'info' ? 'Guide' : substep.done ? 'Complete' : substep.kind === 'optional' ? 'Optional' : 'To do';
                            const content = (
                                <>
                                    <strong><span className={styles.substepNumber}>{currentStep.number}{letter}</span>{substep.title}</strong>
                                    <p>{substep.description}</p>
                                    <span className={styles.substepStatus}>{status}</span>
                                </>
                            );
                            return (
                                <li key={substep.id}>
                                    {substep.kind === 'info'
                                        ? <><div>{content}</div><span className={styles.guideMarker} aria-label="Informational guidance">Guide</span></>
                                        : (
                                            <button type="button" className={styles.substepAction} aria-label={`Go to ${substep.title}`} onClick={() => navigate(currentStep.path)}>
                                                <span className={styles.substepContent}>{content}</span>
                                                <CompletionCheckBadge checked={substep.done} label={`${substep.title}: ${substep.done ? 'complete' : substep.kind === 'optional' ? 'optional' : 'incomplete'}`} className={styles.substepCheck} />
                                            </button>
                                        )}
                                </li>
                            );
                        })}
                    </ol>
                    <div className={styles.detailFooter}>
                        <div className={styles.carouselControls}>
                            <IconButton size="sm" aria-label="Previous onboarding step" disabled={currentStepIndex === 0} onClick={() => setStep(currentStepIndex - 1)}><ChevronRightIcon className={styles.previousIcon} size={16} /></IconButton>
                            <span className={styles.stepPosition}>{currentStep.number}/{steps.length}</span>
                            <IconButton size="sm" aria-label="Next onboarding step" disabled={currentStepIndex === steps.length - 1} onClick={() => setStep(currentStepIndex + 1)}><ChevronRightIcon size={16} /></IconButton>
                        </div>
                        <Button size="sm" variant="ghost" aria-label="Back to compact view" onClick={closeDetails}>Compact</Button>
                        <Button size="sm" variant="ghost" aria-label="Dismiss onboarding" onClick={() => setConfirmDismiss(true)}>Dismiss</Button>
                    </div>
                </div>
            )}
        </aside>
        <ConfirmationModal isOpen={confirmDismiss} onClose={() => setConfirmDismiss(false)} onConfirm={dismiss} title="Dismiss onboarding?" message="This hides Getting Started for this fractal. You can restore it from Settings." confirmText="Dismiss" />
        </>
    );
}
