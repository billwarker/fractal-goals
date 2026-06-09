import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import GoalIcon from '../components/atoms/GoalIcon';
import { publicApi } from '../utils/api';
import styles from './Landing.module.css';

const FlowTree = lazy(() => import('../FlowTree'));

const goalLevels = [
    { label: 'Ultimate', shape: 'twelvePointStar', color: '#4f9cf9', secondaryColor: '#102235' },
    { label: 'Long Term', shape: 'hexagon', color: '#3bc57c', secondaryColor: '#0f271c' },
    { label: 'Mid Term', shape: 'diamond', color: '#f59f4d', secondaryColor: '#2c1d0f' },
    { label: 'Short Term', shape: 'triangle', color: '#8b6fff', secondaryColor: '#181329' },
    { label: 'Immediate', shape: 'circle', color: '#ef6a6a', secondaryColor: '#301515' },
];

const levelByType = {
    UltimateGoal: goalLevels[0],
    LongTermGoal: goalLevels[1],
    MidTermGoal: goalLevels[2],
    ShortTermGoal: goalLevels[3],
    ImmediateGoal: goalLevels[4],
};

const seoMeta = {
    title: 'Fractal Goals - One App for Goals, Programs & Training',
    description: 'Break big goals into trackable trees, build your own programs, and log every session in one composable platform. Built for people training across many disciplines.',
    ogTitle: 'Track every goal, program, and training session in one place',
};

const makeGoal = (id, name, type, children = [], isSmart = false) => ({
    id,
    name,
    type,
    children,
    is_smart: isSmart,
    created_at: '2026-01-01T00:00:00Z',
});

const examples = [
    {
        id: 'guitar',
        label: 'Guitar practice tracker',
        root: 'Become a skilled guitar player',
        tree: makeGoal('guitar-root', 'Become a skilled guitar player', 'UltimateGoal', [
            makeGoal('guitar-musicianship', 'Build complete musicianship', 'LongTermGoal', [
                makeGoal('guitar-fretboard', 'Map the fretboard', 'MidTermGoal', [
                    makeGoal('guitar-caged', 'Practice CAGED triads', 'ShortTermGoal', [
                        makeGoal('guitar-caged-session', '20 minute triad session', 'ImmediateGoal'),
                    ]),
                    makeGoal('guitar-notes', 'Name notes up to 12th fret', 'ImmediateGoal'),
                ]),
                makeGoal('guitar-rhythm', 'Develop reliable rhythm', 'MidTermGoal', [
                    makeGoal('guitar-metronome', 'Metronome strumming ladder', 'ShortTermGoal', [
                        makeGoal('guitar-eighths', 'Eighth-note groove drill', 'ImmediateGoal'),
                    ]),
                ]),
            ], true),
            makeGoal('guitar-repertoire', 'Perform songs confidently', 'LongTermGoal', [
                makeGoal('guitar-songbook', 'Build a 10 song setlist', 'MidTermGoal', [
                    makeGoal('guitar-song-one', 'Polish first full song', 'ShortTermGoal', [
                        makeGoal('guitar-record-take', 'Record one clean take', 'ImmediateGoal'),
                    ]),
                ]),
            ]),
        ], true),
        metrics: ['42 practice hours', '18 sessions', '7 songs in progress'],
        features: [
            {
                title: 'Goal Trees - Break big goals into trackable pieces',
                body: 'Start with the identity-level goal, then branch it into themes, sub-goals, and concrete sessions. Nothing floats free; every task connects to the ambition it serves.',
                visual: {
                    type: 'hierarchy',
                    rows: ['Skilled guitar player', 'Complete musicianship', 'Map the fretboard', '20 minute triad session'],
                },
            },
            {
                title: 'Programs - Turn goals into a repeatable weekly plan',
                body: 'Build your own program from your own goals - alternate the work across the week so progress does not depend on motivation or memory.',
                visual: {
                    type: 'program',
                    rows: ['Mon: CAGED triads', 'Wed: metronome ladder', 'Fri: song polish', 'Sun: record + review'],
                },
            },
            {
                title: 'Sessions - Log what you actually did',
                body: 'Capture duration, reps, holds, attempts, and notes, with every activity tied to the goal it supports. This is your training log, structured.',
                visual: {
                    type: 'session',
                    rows: ['Triads: 20m', 'Metronome: 12m', 'Clean take attempts: 4', 'Notes: B string weak spot'],
                },
            },
            {
                title: 'Analytics - Watch progress roll up the tree',
                body: 'See time, volume, streaks, and outcome metrics connect back to the larger goal, so improvement is visible instead of assumed.',
                visual: {
                    type: 'metrics',
                    rows: ['Practice time +18%', 'Tempo target 92 BPM', 'Song confidence 7/10', 'Weekly streak 4'],
                },
            },
        ],
    },
    {
        id: 'calisthenics',
        label: 'Calisthenics training log',
        root: 'Become an elite calisthenics athlete',
        tree: makeGoal('cal-root', 'Become an elite calisthenics athlete', 'UltimateGoal', [
            makeGoal('cal-strength', 'Build elite relative strength', 'LongTermGoal', [
                makeGoal('cal-pull', 'Master pulling strength', 'MidTermGoal', [
                    makeGoal('cal-muscle-up', 'Strict muscle-up progression', 'ShortTermGoal', [
                        makeGoal('cal-false-grip', 'False grip pulls 5x3', 'ImmediateGoal'),
                    ]),
                    makeGoal('cal-front-lever', 'Front lever tuck holds', 'ImmediateGoal'),
                ]),
                makeGoal('cal-push', 'Develop pressing power', 'MidTermGoal', [
                    makeGoal('cal-hspu', 'Wall handstand push-up block', 'ShortTermGoal', [
                        makeGoal('cal-negatives', 'Controlled negatives', 'ImmediateGoal'),
                    ]),
                ]),
            ], true),
            makeGoal('cal-mobility', 'Stay mobile and resilient', 'LongTermGoal', [
                makeGoal('cal-shoulders', 'Bulletproof shoulders', 'MidTermGoal', [
                    makeGoal('cal-scapula', 'Scapular control circuit', 'ImmediateGoal'),
                ]),
            ]),
        ], true),
        metrics: ['31 training hours', '24 workouts', '5 skill targets'],
        features: [
            {
                title: 'Goal Trees - Break big goals into trackable pieces',
                body: 'Start with the identity-level goal, then branch it into themes, sub-goals, and concrete sessions. Nothing floats free; every task connects to the ambition it serves.',
                visual: { type: 'hierarchy', rows: ['Elite calisthenics athlete', 'Relative strength', 'Strict muscle-up', 'False grip pulls 5x3'] },
            },
            {
                title: 'Programs - Turn goals into a repeatable weekly plan',
                body: 'Build your own program from your own goals - alternate the work across the week so progress does not depend on motivation or memory.',
                visual: { type: 'program', rows: ['Pull strength', 'Mobility reset', 'Push power', 'Skill density'] },
            },
            {
                title: 'Sessions - Log what you actually did',
                body: 'Capture duration, reps, holds, attempts, and notes, with every activity tied to the goal it supports. This is your training log, structured.',
                visual: { type: 'session', rows: ['False grip pulls 5x3', 'Tuck hold 4x12s', 'Wall HSPU negatives', 'RPE 8'] },
            },
            {
                title: 'Analytics - Watch progress roll up the tree',
                body: 'See time, volume, streaks, and outcome metrics connect back to the larger goal, so improvement is visible instead of assumed.',
                visual: { type: 'metrics', rows: ['Pull volume +12%', 'Hold time 48s', 'Recovery score 8/10', 'Skill attempts 36'] },
            },
        ],
    },
    {
        id: 'speaking',
        label: 'Public speaking practice',
        root: 'Become a confident public speaker',
        tree: makeGoal('speak-root', 'Become a confident public speaker', 'UltimateGoal', [
            makeGoal('speak-presence', 'Build stage presence', 'LongTermGoal', [
                makeGoal('speak-voice', 'Strengthen vocal control', 'MidTermGoal', [
                    makeGoal('speak-breath', 'Breath and pause practice', 'ShortTermGoal', [
                        makeGoal('speak-read', 'Record 3 minute read', 'ImmediateGoal'),
                    ]),
                ]),
                makeGoal('speak-body', 'Use body language intentionally', 'MidTermGoal', [
                    makeGoal('speak-gesture', 'Gesture rehearsal loop', 'ImmediateGoal'),
                ]),
            ], true),
            makeGoal('speak-content', 'Deliver clear persuasive talks', 'LongTermGoal', [
                makeGoal('speak-structure', 'Master talk structure', 'MidTermGoal', [
                    makeGoal('speak-outline', 'Outline 5 minute talk', 'ShortTermGoal', [
                        makeGoal('speak-hook', 'Write opening hook', 'ImmediateGoal'),
                    ]),
                ]),
            ]),
        ], true),
        metrics: ['12 talks recorded', '9 feedback notes', '6 delivery drills'],
        features: [
            {
                title: 'Goal Trees - Break big goals into trackable pieces',
                body: 'Start with the identity-level goal, then branch it into themes, sub-goals, and concrete sessions. Nothing floats free; every task connects to the ambition it serves.',
                visual: { type: 'hierarchy', rows: ['Confident public speaker', 'Stage presence', 'Vocal control', 'Record 3 minute read'] },
            },
            {
                title: 'Programs - Turn goals into a repeatable weekly plan',
                body: 'Build your own program from your own goals - alternate the work across the week so progress does not depend on motivation or memory.',
                visual: { type: 'program', rows: ['Voice drill', 'Gesture loop', 'Outline sprint', 'Full rehearsal'] },
            },
            {
                title: 'Sessions - Log what you actually did',
                body: 'Capture duration, reps, holds, attempts, and notes, with every activity tied to the goal it supports. This is your training log, structured.',
                visual: { type: 'session', rows: ['Read: 3m', 'Pauses: 14', 'Filler words: 8', 'Feedback: slower open'] },
            },
            {
                title: 'Analytics - Watch progress roll up the tree',
                body: 'See time, volume, streaks, and outcome metrics connect back to the larger goal, so improvement is visible instead of assumed.',
                visual: { type: 'metrics', rows: ['Filler words -34%', 'Runs completed 12', 'Confidence 8/10', 'Feedback items closed 6'] },
            },
        ],
    },
    {
        id: 'chinese',
        label: 'Chinese language tracker',
        root: 'Become fluent in Chinese',
        tree: makeGoal('zh-root', 'Become fluent in Chinese', 'UltimateGoal', [
            makeGoal('zh-comprehension', 'Understand native content', 'LongTermGoal', [
                makeGoal('zh-listening', 'Build listening comprehension', 'MidTermGoal', [
                    makeGoal('zh-podcast', 'Podcast shadowing block', 'ShortTermGoal', [
                        makeGoal('zh-shadow', 'Shadow 10 minutes', 'ImmediateGoal'),
                    ]),
                    makeGoal('zh-dialogue', 'Review dialogue transcript', 'ImmediateGoal'),
                ]),
                makeGoal('zh-reading', 'Read everyday Chinese', 'MidTermGoal', [
                    makeGoal('zh-graded', 'Finish graded reader chapter', 'ImmediateGoal'),
                ]),
            ], true),
            makeGoal('zh-output', 'Speak and write comfortably', 'LongTermGoal', [
                makeGoal('zh-speaking', 'Hold fluid conversations', 'MidTermGoal', [
                    makeGoal('zh-tutor', 'Prepare tutor conversation', 'ShortTermGoal', [
                        makeGoal('zh-story', 'Tell one short story', 'ImmediateGoal'),
                    ]),
                ]),
                makeGoal('zh-characters', 'Build character recall', 'MidTermGoal', [
                    makeGoal('zh-anki', 'Review 40 due cards', 'ImmediateGoal'),
                ]),
            ]),
        ], true),
        metrics: ['56 study hours', '1,240 cards reviewed', '14 speaking sessions'],
        features: [
            {
                title: 'Goal Trees - Break big goals into trackable pieces',
                body: 'Start with the identity-level goal, then branch it into themes, sub-goals, and concrete sessions. Nothing floats free; every task connects to the ambition it serves.',
                visual: { type: 'hierarchy', rows: ['Fluent in Chinese', 'Understand native content', 'Listening comprehension', 'Shadow 10 minutes'] },
            },
            {
                title: 'Programs - Turn goals into a repeatable weekly plan',
                body: 'Build your own program from your own goals - alternate the work across the week so progress does not depend on motivation or memory.',
                visual: { type: 'program', rows: ['Listening shadow', 'Reader chapter', 'Tutor prep', 'Anki review'] },
            },
            {
                title: 'Sessions - Log what you actually did',
                body: 'Capture duration, reps, holds, attempts, and notes, with every activity tied to the goal it supports. This is your training log, structured.',
                visual: { type: 'session', rows: ['Shadowing: 10m', 'Cards reviewed: 40', 'Tutor topic: travel', 'New phrases: 12'] },
            },
            {
                title: 'Analytics - Watch progress roll up the tree',
                body: 'See time, volume, streaks, and outcome metrics connect back to the larger goal, so improvement is visible instead of assumed.',
                visual: { type: 'metrics', rows: ['Listening +22%', 'Cards mature 68%', 'Speaking sessions 14', 'Study streak 11'] },
            },
        ],
    },
];

const featureNames = ['Goal Trees', 'Programs', 'Sessions', 'Analytics'];

const audienceCards = [
    {
        title: 'You train across multiple disciplines',
        body: 'Guitar, calisthenics, a language, a speaking habit - track them as one connected system instead of juggling a separate app for each.',
    },
    {
        title: "You've outgrown the notes app",
        body: "If your training log currently lives in your phone's notes, a spreadsheet, or three different trackers, this is the upgrade: structured, searchable, and tied to real goals.",
    },
    {
        title: 'You already know your programming',
        body: "Fractal Goals isn't a coach and won't tell you what to do. You bring the plan; it gives you the structure to organize, run, and measure it.",
    },
    {
        title: "You're driven by outcomes",
        body: 'Every session you log rolls up to the goal it serves, so you can always see whether the daily work is moving the big target.',
    },
];

const faqItems = [
    {
        question: 'What is Fractal Goals?',
        answer: 'Fractal Goals is a composable goal-tracking platform. You set a big goal, break it into a tree of smaller goals, build programs toward them, and log sessions, activities, and metrics - all connected in one place.',
    },
    {
        question: 'Can I track multiple goals or hobbies in one app?',
        answer: 'Yes. Fractal Goals is built for people working toward several things at once. You can run guitar practice, a calisthenics program, language study, and more side by side, each as its own goal tree, in a single system.',
    },
    {
        question: 'Do I have to follow a preset program?',
        answer: "No. Fractal Goals does not prescribe a plan. You bring your own programming and use the platform to structure, schedule, and measure it.",
    },
    {
        question: 'How is it different from a habit tracker?',
        answer: 'Habit trackers count streaks. Fractal Goals models the whole structure beneath a goal - sub-goals, programs, sessions, and metrics that roll up - so you can see not just that you showed up, but whether the work is moving the outcome.',
    },
    {
        question: 'Can I use it as a training log?',
        answer: 'Yes. Logging sessions - reps, holds, durations, attempts, and notes - is core to how it works, and every entry stays tied to the goal it supports.',
    },
    {
        question: 'How do I get access?',
        answer: 'Fractal Goals is in invite-based private beta while the product is being shaped. Request access below and the team follows up with testers who match the current build.',
    },
];

const initialFormState = {
    name: '',
    email: '',
    use_case: 'personal goals',
    note: '',
};

function FeatureVisual({ feature }) {
    const iconSet = {
        hierarchy: ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ImmediateGoal'],
        program: ['LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal'],
        session: ['ImmediateGoal', 'ShortTermGoal', 'ImmediateGoal', 'MidTermGoal'],
        metrics: ['MidTermGoal', 'ImmediateGoal', 'LongTermGoal', 'ShortTermGoal'],
    };
    const icons = iconSet[feature.visual.type] || iconSet.hierarchy;

    return (
        <div className={styles.featureVisual} aria-label={`${feature.title} visual`}>
            {feature.visual.rows.map((row, index) => {
                const level = levelByType[icons[index] || 'ImmediateGoal'];
                return (
                    <div className={styles.visualRow} key={row}>
                        <GoalIcon
                            shape={level.shape}
                            color={level.color}
                            secondaryColor={level.secondaryColor}
                            isSmart={index === 0}
                            size={24}
                        />
                        <span>{row}</span>
                    </div>
                );
            })}
        </div>
    );
}

function Landing() {
    const [selectedExampleId, setSelectedExampleId] = useState(examples[0].id);
    const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
    const [formState, setFormState] = useState(initialFormState);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');

    const selectedExample = useMemo(
        () => examples.find((example) => example.id === selectedExampleId) || examples[0],
        [selectedExampleId]
    );
    const activeFeature = selectedExample.features[activeFeatureIndex] || selectedExample.features[0];

    useEffect(() => {
        const previousTitle = document.title;
        const upsertMeta = (selector, attributes) => {
            let element = document.head.querySelector(selector);
            const existed = Boolean(element);
            const previousAttributes = {};

            if (!element) {
                element = document.createElement('meta');
                document.head.appendChild(element);
            } else {
                Object.keys(attributes).forEach((key) => {
                    previousAttributes[key] = element.getAttribute(key);
                });
            }
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
            return { element, existed, previousAttributes, attributes };
        };

        document.title = seoMeta.title;
        const descriptionMeta = upsertMeta('meta[name="description"]', {
            name: 'description',
            content: seoMeta.description,
        });
        const ogTitleMeta = upsertMeta('meta[property="og:title"]', {
            property: 'og:title',
            content: seoMeta.ogTitle,
        });
        const ogDescriptionMeta = upsertMeta('meta[property="og:description"]', {
            property: 'og:description',
            content: seoMeta.description,
        });
        const faqScript = document.createElement('script');
        faqScript.type = 'application/ld+json';
        faqScript.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqItems.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: item.answer,
                },
            })),
        });
        document.head.appendChild(faqScript);

        return () => {
            document.title = previousTitle;
            faqScript.remove();
            [descriptionMeta, ogTitleMeta, ogDescriptionMeta].forEach((element) => {
                if (!element?.element?.parentNode) return;
                if (!element.existed) {
                    element.element.parentNode.removeChild(element.element);
                    return;
                }
                Object.keys(element.attributes).forEach((key) => {
                    const previousValue = element.previousAttributes[key];
                    if (previousValue == null) {
                        element.element.removeAttribute(key);
                    } else {
                        element.element.setAttribute(key, previousValue);
                    }
                });
            });
        };
    }, []);

    const canSubmit = useMemo(() => (
        formState.name.trim().length >= 2
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim())
        && formState.use_case.trim().length >= 2
        && status !== 'submitting'
    ), [formState, status]);

    const updateField = (field) => (event) => {
        setFormState((current) => ({
            ...current,
            [field]: event.target.value,
        }));
    };

    const handleExampleSelect = (exampleId) => {
        setSelectedExampleId(exampleId);
        setActiveFeatureIndex(0);
    };

    const showPreviousFeature = () => {
        setActiveFeatureIndex((current) => (
            current === 0 ? selectedExample.features.length - 1 : current - 1
        ));
    };

    const showNextFeature = () => {
        setActiveFeatureIndex((current) => (
            current === selectedExample.features.length - 1 ? 0 : current + 1
        ));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit) {
            setStatus('error');
            setMessage('Add your name, a valid email, and what you want to test.');
            return;
        }

        setStatus('submitting');
        setMessage('');

        try {
            const payload = {
                ...formState,
                name: formState.name.trim(),
                email: formState.email.trim(),
                use_case: formState.use_case.trim(),
                note: formState.note.trim() || undefined,
            };
            const response = await publicApi.createBetaSignup(payload);
            setStatus('success');
            setMessage(response.data?.created
                ? "You're on the private beta request list."
                : 'Your private beta request has been updated.');
            setFormState(initialFormState);
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || 'Could not send the request. Please try again.');
        }
    };

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <a className={styles.brand} href="/">
                    <span className={styles.brandMark}>
                        <GoalIcon
                            shape="twelvePointStar"
                            color="var(--color-brand-primary)"
                            secondaryColor="var(--color-bg-input)"
                            isSmart
                            size={34}
                        />
                    </span>
                    <span>Fractal Goals</span>
                </a>
                <nav className={styles.nav} aria-label="Primary">
                    <a href="#examples">Examples</a>
                    <a href="#features">Features</a>
                    <a href="#faq">FAQ</a>
                    <a href="#beta">Private beta</a>
                    <a href="https://my.fractalgoals.com">Open app</a>
                </nav>
            </header>

            <section className={styles.hero} aria-labelledby="landing-title">
                <div className={styles.kicker}>Composable goal tracking</div>
                <h1 id="landing-title">Track every goal, program, and training session in one place</h1>
                <h2>
                    Want to achieve big goals? Start by making them smaller. Fractal Goals breaks any
                    ambition into a tree of smaller goals, lets you build your own programs toward them,
                    and logs every session, activity, and metric - so all your training, across every
                    discipline, lives in one connected system instead of five scattered apps.
                </h2>
                <div className={styles.heroActions}>
                    <a className={styles.primaryAction} href="#beta">Request beta access</a>
                    <a className={styles.secondaryAction} href="https://my.fractalgoals.com">Go to app</a>
                </div>
            </section>

            <section className={styles.audienceSection} aria-labelledby="audience-title">
                <div className={styles.sectionHeader}>
                    <span>Built for serious, self-directed practitioners</span>
                    <h2 id="audience-title">If you're training for more than one thing, this is your home base.</h2>
                </div>
                <div className={styles.audienceGrid}>
                    {audienceCards.map((card) => (
                        <article className={styles.audienceCard} key={card.title}>
                            <h3>{card.title}</h3>
                            <p>{card.body}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className={styles.treeSection} id="examples" aria-labelledby="examples-title">
                <div className={styles.sectionHeader}>
                    <span>Example fractals</span>
                    <h2 id="examples-title">See how real goals break down - from ambition to today's session.</h2>
                    <p>
                        Every Fractal Goals plan starts as a single big goal and branches into smaller,
                        trackable goals, programs, and sessions. Here are four complete examples across
                        different disciplines.
                    </p>
                </div>
                <div className={styles.exampleToggle} role="tablist" aria-label="Example goal trees">
                    {examples.map((example) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={example.id === selectedExample.id}
                            className={example.id === selectedExample.id ? styles.toggleActive : ''}
                            onClick={() => handleExampleSelect(example.id)}
                            key={example.id}
                        >
                            {example.label}
                        </button>
                    ))}
                </div>
                <div className={styles.flowTreeFrame} aria-label={`${selectedExample.root} goal tree`}>
                    <Suspense fallback={<div className={styles.flowTreeLoading}>Loading preview...</div>}>
                        <FlowTree
                            key={selectedExample.id}
                            treeData={selectedExample.tree}
                            onNodeClick={() => {}}
                            onAddChild={null}
                            viewSettings={{
                                fadeInactiveBranches: false,
                                hideInactiveGoals: false,
                                hideCompletedGoals: false,
                            }}
                            layoutMode="tree"
                        />
                    </Suspense>
                </div>
                <div className={styles.analyticsStrip}>
                    {selectedExample.metrics.map((metric) => {
                        const [value, ...labelParts] = metric.split(' ');
                        return (
                            <div key={metric}>
                                <strong>{value}</strong>
                                <span>{labelParts.join(' ')}</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className={styles.featuresSection} id="features" aria-labelledby="features-title">
                <div className={styles.sectionHeader}>
                    <span>How it works</span>
                    <h2 id="features-title">One system, four views: goals, programs, sessions, and progress.</h2>
                    <p>
                        The same plan shows up four ways, so you can zoom from your top-level goal all
                        the way down to today's reps - and back up to the metrics that prove it's working.
                    </p>
                </div>
                <div className={styles.carousel}>
                    <div className={styles.carouselText}>
                        <span>{featureNames[activeFeatureIndex]}</span>
                        <h3>{activeFeature.title}</h3>
                        <p>{activeFeature.body}</p>
                    </div>
                    <FeatureVisual feature={activeFeature} />
                    <div className={styles.carouselControls}>
                        <button type="button" onClick={showPreviousFeature} aria-label="Previous feature">{'<'}</button>
                        <div className={styles.carouselDots} aria-label="Feature slides">
                            {selectedExample.features.map((feature, index) => (
                                <button
                                    type="button"
                                    aria-label={`Show ${feature.title}`}
                                    aria-current={index === activeFeatureIndex ? 'true' : undefined}
                                    onClick={() => setActiveFeatureIndex(index)}
                                    key={feature.title}
                                />
                            ))}
                        </div>
                        <button type="button" onClick={showNextFeature} aria-label="Next feature">{'>'}</button>
                    </div>
                </div>
            </section>

            <section className={styles.faqSection} id="faq" aria-labelledby="faq-title">
                <div className={styles.sectionHeader}>
                    <span>FAQ</span>
                    <h2 id="faq-title">Common questions</h2>
                </div>
                <div className={styles.faqGrid}>
                    {faqItems.map((item) => (
                        <article className={styles.faqItem} key={item.question}>
                            <h3>{item.question}</h3>
                            <p>{item.answer}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className={styles.betaSection} id="beta" aria-labelledby="beta-title">
                <div className={styles.betaCopy}>
                    <span>Private beta</span>
                    <h2 id="beta-title">Help test the next version of goal-tracking software.</h2>
                    <p>
                        Beta access is invite-based while the product is being shaped. Tell us what you
                        want to organize - your training, a creative practice, a language, a startup -
                        and we'll follow up with testers who match the current build.
                    </p>
                </div>
                <form className={styles.betaForm} onSubmit={handleSubmit}>
                    <label>
                        Name
                        <input
                            type="text"
                            value={formState.name}
                            onChange={updateField('name')}
                            autoComplete="name"
                            required
                        />
                    </label>
                    <label>
                        Email
                        <input
                            type="email"
                            value={formState.email}
                            onChange={updateField('email')}
                            autoComplete="email"
                            required
                        />
                    </label>
                    <label>
                        Testing focus
                        <select value={formState.use_case} onChange={updateField('use_case')} required>
                            <option value="personal goals">Personal goals</option>
                            <option value="creative practice">Creative practice</option>
                            <option value="fitness training">Fitness training</option>
                            <option value="startup or work">Startup or work</option>
                            <option value="research or learning">Research or learning</option>
                        </select>
                    </label>
                    <label>
                        Note
                        <textarea
                            value={formState.note}
                            onChange={updateField('note')}
                            rows={4}
                            maxLength={1000}
                        />
                    </label>
            <button type="submit" disabled={!canSubmit}>
                        {status === 'submitting' ? 'Sending...' : 'Request invite'}
                    </button>
                    {message && (
                        <p className={status === 'success' ? styles.successMessage : styles.errorMessage} role="status">
                            {message}
                        </p>
                    )}
                </form>
            </section>
        </main>
    );
}

export default Landing;
