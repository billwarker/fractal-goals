import React, { useEffect, useRef, useState } from 'react';

import { useGoalLevels } from '../../../contexts/GoalLevelsContext';
import Button from '../../atoms/Button';
import GoalIcon from '../../atoms/GoalIcon';
import styles from './WelcomeFlow.module.css';

const EXAMPLE_GOALS = [
    'Run a marathon',
    'Play guitar at a jam session',
    'Speak conversational Spanish',
    'Launch my first app',
    'Get stronger than ever',
];
const MAX_FIRST_GOALS = 3;
const STEP_COUNT = 3;

function makeKey() {
    return globalThis.crypto?.randomUUID?.() || `welcome-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The big goal and its first long-term goals, drawn the way the Goals page will. */
function TreePreview({ name, goals }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const level = (type) => ({
        shape: getGoalIcon(type) || 'circle',
        color: getGoalColor(type),
        secondaryColor: getGoalSecondaryColor(type),
    });
    const root = level('UltimateGoal');
    const child = level('LongTermGoal');
    return (
        <div className={styles.preview} aria-label="Preview of your tree">
            <div className={styles.previewRoot}>
                <GoalIcon {...root} size={22} />
                <span className={name ? '' : styles.previewPlaceholder}>{name || 'Your big goal'}</span>
            </div>
            {goals.length > 0 && (
                <ul className={styles.previewChildren}>
                    {goals.map((childName, index) => (
                        <li key={index}>
                            <GoalIcon {...child} size={18} />
                            <span>{childName}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * First run for someone with no fractals: what a fractal is, their big goal, and optionally the
 * first long-term goals beneath it, created together (POST /fractals/quickstart).
 */
function WelcomeFlow({ onCreate, onSkip, creating = false }) {
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [firstGoals, setFirstGoals] = useState(['', '', '']);
    // One key for this run of the flow, so a retried "Create" never makes a second fractal.
    const [idempotencyKey] = useState(makeKey);
    const headingRef = useRef(null);

    // Each step announces itself and takes focus, so keyboard and screen reader users follow along.
    useEffect(() => {
        headingRef.current?.focus();
    }, [step]);

    const trimmedName = name.trim();
    const childNames = firstGoals.map((goal) => goal.trim()).filter(Boolean);

    const submitStep = (event) => {
        event.preventDefault();
        if (step === 1 && !trimmedName) return;
        if (step < STEP_COUNT - 1) {
            setStep(step + 1);
            return;
        }
        onCreate({ name: trimmedName, long_term_goals: childNames.slice(0, MAX_FIRST_GOALS) }, idempotencyKey);
    };

    return (
        <main className={styles.page}>
            <form className={styles.card} onSubmit={submitStep} aria-labelledby="welcome-step-title">
                <div className={styles.progress} aria-label={`Step ${step + 1} of ${STEP_COUNT}`}>
                    {Array.from({ length: STEP_COUNT }, (_, index) => (
                        <span key={index} className={index <= step ? styles.progressDone : styles.progressDot} />
                    ))}
                </div>

                {step === 0 && (
                    <>
                        <h1 id="welcome-step-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                            Turn a big goal into a tree you can work on
                        </h1>
                        <p className={styles.lead}>
                            A fractal starts with one ambition and breaks it into smaller goals, each one something
                            you can practise and measure. Sessions, notes and programs then hang off the goals they serve.
                        </p>
                        <div className={styles.illustration} aria-hidden="true">
                            <TreePreview name="Play guitar at a jam session" goals={['Learn 20 standards', 'Comp with confidence']} />
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <h1 id="welcome-step-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                            What’s the big goal?
                        </h1>
                        <p className={styles.lead}>The ambition at the top of your tree. You can rename it any time.</p>
                        <label className={styles.field}>
                            <span>Your big goal</span>
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Run a marathon"
                                maxLength={200}
                                autoComplete="off"
                                required
                            />
                        </label>
                        <div className={styles.examples} role="group" aria-label="Examples">
                            {EXAMPLE_GOALS.map((example) => (
                                <button key={example} type="button" className={styles.example} onClick={() => setName(example)}>
                                    {example}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <h1 id="welcome-step-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                            Break it down
                        </h1>
                        <p className={styles.lead}>
                            Add up to three long-term goals that lead to “{trimmedName}”. Optional: you can add these later.
                        </p>
                        <div className={styles.fields}>
                            {firstGoals.map((goal, index) => (
                                <label key={index} className={styles.field}>
                                    <span>Long-term goal {index + 1}</span>
                                    <input
                                        value={goal}
                                        onChange={(event) => setFirstGoals((current) => current.map((value, position) => (
                                            position === index ? event.target.value : value
                                        )))}
                                        maxLength={200}
                                        autoComplete="off"
                                    />
                                </label>
                            ))}
                        </div>
                        <TreePreview name={trimmedName} goals={childNames} />
                    </>
                )}

                <div className={styles.actions}>
                    {step > 0 && (
                        <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={creating}>Back</Button>
                    )}
                    <Button type="submit" isLoading={creating} disabled={step === 1 && !trimmedName}>
                        {step === 0 && 'Get started'}
                        {step === 1 && 'Continue'}
                        {step === 2 && (childNames.length ? 'Create my tree' : 'Create my goal')}
                    </Button>
                </div>
                <button type="button" className={styles.skip} onClick={onSkip} disabled={creating}>
                    I’ll set it up myself
                </button>
            </form>
        </main>
    );
}

export default WelcomeFlow;
