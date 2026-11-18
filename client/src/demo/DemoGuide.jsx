import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import GoalIcon from '../components/atoms/GoalIcon';
import ThemeToggleButton from '../components/common/ThemeToggleButton';
import { readLocalStorageValue, writeLocalStorageValue } from '../utils/localPreferences';
import { trackPublicEvent } from '../utils/publicTelemetry';
import { demoIconProps, demoRootName } from './demoExamples';
import { buildTourSteps } from './demoTour';
import Spotlight from './Spotlight';
import styles from './DemoGuide.module.css';

const STEP_KEY = 'demo-guide-step';
const COLLAPSED_KEY = 'demo-guide-collapsed';

const readStep = () => {
    const value = Number(readLocalStorageValue(STEP_KEY));
    return Number.isInteger(value) && value >= 0 ? value : 0;
};

/**
 * The demo's walkthrough: the onboarding card, repurposed. It steps through the real app
 * on the chosen example, switches examples in place, and keeps sign-up one tap away.
 * `onSignup(source)` says which button asked: `demo_tour_end` (the last step) or `demo_guide`.
 */
export default function DemoGuide({ examples, onSignup, onExit }) {
    const location = useLocation();
    const navigate = useNavigate();
    const guideRef = useRef(null);
    const startsTour = new URLSearchParams(location.search).get('tour') === '1';
    const [stepIndex, setStepIndex] = useState(() => (startsTour ? 0 : readStep()));
    const [collapsed, setCollapsed] = useState(() => !startsTour && readLocalStorageValue(COLLAPSED_KEY) === 'true');
    const [spotlightOn, setSpotlightOn] = useState(true);

    const rootId = location.pathname.split('/')[1] || '';
    const activeExample = examples.find((example) => example.root_id === rootId) || examples[0] || null;
    const steps = useMemo(() => buildTourSteps(activeExample), [activeExample]);
    const step = steps[Math.min(stepIndex, steps.length - 1)];
    const tourCompleted = useRef(false);
    const reachedLastStep = steps.length > 0 && stepIndex >= steps.length - 1;

    useEffect(() => writeLocalStorageValue(STEP_KEY, String(stepIndex)), [stepIndex]);
    useEffect(() => writeLocalStorageValue(COLLAPSED_KEY, String(collapsed)), [collapsed]);

    // Once per demo visit: the tour reached its last step.
    useEffect(() => {
        if (!reachedLastStep || tourCompleted.current || !activeExample) return;
        tourCompleted.current = true;
        const position = examples.indexOf(activeExample);
        trackPublicEvent('demo_tour_completed', { example_position: position >= 0 ? position : null });
    }, [activeExample, examples, reachedLastStep]);

    // `?tour=1` (from the landing page) starts at the top; drop it so a reload resumes instead.
    useEffect(() => {
        if (!startsTour) return;
        const params = new URLSearchParams(location.search);
        params.delete('tour');
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true });
    }, [location.pathname, location.search, navigate, startsTour]);

    // The ring is a pointer, not a wall: the first click on the page clears it.
    useEffect(() => {
        if (!spotlightOn) return undefined;
        const handlePointerDown = (event) => {
            if (!guideRef.current?.contains(event.target)) setSpotlightOn(false);
        };
        document.addEventListener('pointerdown', handlePointerDown, true);
        return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    }, [spotlightOn]);

    const goTo = useCallback((index, example = activeExample) => {
        const nextSteps = example === activeExample ? steps : buildTourSteps(example);
        const bounded = Math.max(0, Math.min(index, nextSteps.length - 1));
        setStepIndex(bounded);
        setSpotlightOn(true);
        const target = nextSteps[bounded].path;
        if (target) navigate(target);
        else if (example !== activeExample) navigate(`/${example.root_id}/goals`);
    }, [activeExample, navigate, steps]);

    const handleKeyDown = (event) => {
        if (event.target.closest('input, textarea, select')) return;
        if (event.key === 'ArrowRight') goTo(stepIndex + 1);
        else if (event.key === 'ArrowLeft') goTo(stepIndex - 1);
        else if (event.key === 'Escape') setCollapsed(true);
        else return;
        event.preventDefault();
    };

    if (!activeExample || !step) return null;
    const isLast = stepIndex >= steps.length - 1;
    const position = `${stepIndex + 1} of ${steps.length}`;

    if (collapsed) {
        return createPortal(
            <div className={`${styles.guide} ${styles.pill}`} ref={guideRef}>
                <button type="button" className={styles.pillOpen} onClick={() => setCollapsed(false)} aria-label={`Open the demo guide, step ${position}`}>
                    <span className={styles.eyebrow}>Live demo</span>
                    <span className={styles.pillStep}>{step.title}</span>
                </button>
                <button type="button" className={styles.signupSmall} onClick={() => onSignup('demo_guide')}>Sign up</button>
            </div>,
            document.body,
        );
    }

    // In a portal: an app modal that makes the page inert must not trap the guide.
    return createPortal(
        <>
            <Spotlight key={`${activeExample.root_id}:${step.id}`} selector={step.anchor} active={spotlightOn} />
            <section
                className={styles.guide}
                ref={guideRef}
                aria-label="Demo guide"
                onKeyDown={handleKeyDown}
            >
                <header className={styles.header}>
                    <span className={styles.eyebrow}>Live demo</span>
                    <div className={styles.headerTools}>
                        <ThemeToggleButton />
                        <button type="button" className={styles.iconButton} onClick={() => setCollapsed(true)} aria-label="Minimise the demo guide">
                            <span aria-hidden="true">–</span>
                        </button>
                    </div>
                </header>

                <div className={styles.examples} role="group" aria-label="Example fractals">
                    {examples.map((example) => {
                        const selected = example.root_id === activeExample.root_id;
                        return (
                            <button
                                type="button"
                                key={example.root_id}
                                className={`${styles.example} ${selected ? styles.exampleActive : ''}`}
                                aria-pressed={selected}
                                aria-label={demoRootName(example)}
                                title={demoRootName(example)}
                                onClick={() => !selected && goTo(stepIndex, example)}
                            >
                                <GoalIcon {...demoIconProps(example.icon)} size={26} />
                            </button>
                        );
                    })}
                    <span className={styles.exampleName}>{activeExample.root_name || activeExample.label}</span>
                </div>

                <div className={styles.step}>
                    <div className={styles.progress} aria-hidden="true">
                        <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
                    </div>
                    <p className={styles.position}>Step {position}</p>
                    <h2 className={styles.title} aria-live="polite">{step.title}</h2>
                    <p className={styles.text}>{step.body}</p>
                    <div className={styles.nav}>
                        <button type="button" className={styles.secondary} onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
                            Back
                        </button>
                        {isLast ? (
                            <button type="button" className={styles.primary} onClick={() => onSignup('demo_tour_end')}>Sign up</button>
                        ) : (
                            <button type="button" className={styles.primary} onClick={() => goTo(stepIndex + 1)}>Next</button>
                        )}
                    </div>
                </div>

                <footer className={styles.footer}>
                    {!isLast && (
                        <button type="button" className={styles.link} onClick={() => onSignup('demo_guide')}>Sign up to build your own</button>
                    )}
                    <button type="button" className={styles.link} onClick={onExit}>Exit demo</button>
                </footer>
            </section>
        </>,
        document.body,
    );
}
