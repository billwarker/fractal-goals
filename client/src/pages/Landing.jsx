import React, { Suspense, lazy, useMemo, useState } from 'react';
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
        label: 'Guitar',
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
                title: 'Compose the path from ambition to today',
                body: 'Start with the large identity-level goal, then break it into musicianship, rhythm, repertoire, and concrete practice sessions.',
                visual: {
                    type: 'hierarchy',
                    rows: ['Skilled guitar player', 'Complete musicianship', 'Map the fretboard', '20 minute triad session'],
                },
            },
            {
                title: 'Turn goals into repeatable programs',
                body: 'Build a weekly program that alternates fretboard work, rhythm drills, repertoire, and recording review.',
                visual: {
                    type: 'program',
                    rows: ['Mon: CAGED triads', 'Wed: metronome ladder', 'Fri: song polish', 'Sun: record + review'],
                },
            },
            {
                title: 'Track sessions with useful evidence',
                body: 'Log what you actually practiced, how long it took, and which goal each activity supported.',
                visual: {
                    type: 'session',
                    rows: ['Triads: 20m', 'Metronome: 12m', 'Clean take attempts: 4', 'Notes: B string weak spot'],
                },
            },
            {
                title: 'Watch metrics roll up through the tree',
                body: 'See practice time, clean takes, tempo targets, and song completion connected back to the larger guitar goal.',
                visual: {
                    type: 'metrics',
                    rows: ['Practice time +18%', 'Tempo target 92 BPM', 'Song confidence 7/10', 'Weekly streak 4'],
                },
            },
        ],
    },
    {
        id: 'calisthenics',
        label: 'Calisthenics',
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
                title: 'Split elite skills into trainable blocks',
                body: 'Model muscle-ups, handstand push-ups, levers, and mobility as connected branches instead of isolated workout notes.',
                visual: { type: 'hierarchy', rows: ['Elite calisthenics athlete', 'Relative strength', 'Strict muscle-up', 'False grip pulls 5x3'] },
            },
            {
                title: 'Program blocks around recovery',
                body: 'Schedule push, pull, mobility, and skill practice so progression does not compete with recovery.',
                visual: { type: 'program', rows: ['Pull strength', 'Mobility reset', 'Push power', 'Skill density'] },
            },
            {
                title: 'Log sets, holds, and session notes',
                body: 'Track reps, hold times, perceived effort, and technical notes while keeping every activity tied to its goal.',
                visual: { type: 'session', rows: ['False grip pulls 5x3', 'Tuck hold 4x12s', 'Wall HSPU negatives', 'RPE 8'] },
            },
            {
                title: 'Measure progress without flattening it',
                body: 'Compare strength, skill capacity, consistency, and fatigue signals across the whole athletic system.',
                visual: { type: 'metrics', rows: ['Pull volume +12%', 'Hold time 48s', 'Recovery score 8/10', 'Skill attempts 36'] },
            },
        ],
    },
    {
        id: 'speaking',
        label: 'Speaking',
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
                title: 'Separate confidence into practiceable skills',
                body: 'Break public speaking into presence, voice, structure, rehearsal, and feedback loops.',
                visual: { type: 'hierarchy', rows: ['Confident public speaker', 'Stage presence', 'Vocal control', 'Record 3 minute read'] },
            },
            {
                title: 'Build rehearsal programs',
                body: 'Plan drills for voice, gestures, outlines, and full run-throughs before the stakes get high.',
                visual: { type: 'program', rows: ['Voice drill', 'Gesture loop', 'Outline sprint', 'Full rehearsal'] },
            },
            {
                title: 'Track sessions and feedback',
                body: 'Attach notes, recordings, and feedback themes directly to the speaking goals they improve.',
                visual: { type: 'session', rows: ['Read: 3m', 'Pauses: 14', 'Filler words: 8', 'Feedback: slower open'] },
            },
            {
                title: 'See confidence become measurable',
                body: 'Follow talk repetitions, filler-word reduction, feedback themes, and delivery confidence over time.',
                visual: { type: 'metrics', rows: ['Filler words -34%', 'Runs completed 12', 'Confidence 8/10', 'Feedback items closed 6'] },
            },
        ],
    },
    {
        id: 'chinese',
        label: 'Chinese',
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
                title: 'Connect fluency to daily study actions',
                body: 'Model listening, speaking, reading, writing, characters, and review as one composable language system.',
                visual: { type: 'hierarchy', rows: ['Fluent in Chinese', 'Understand native content', 'Listening comprehension', 'Shadow 10 minutes'] },
            },
            {
                title: 'Build balanced study programs',
                body: 'Rotate input, output, character review, and tutor preparation so fluency grows from multiple directions.',
                visual: { type: 'program', rows: ['Listening shadow', 'Reader chapter', 'Tutor prep', 'Anki review'] },
            },
            {
                title: 'Track sessions with language-specific evidence',
                body: 'Log minutes listened, cards reviewed, conversation topics, and notes about what still breaks down.',
                visual: { type: 'session', rows: ['Shadowing: 10m', 'Cards reviewed: 40', 'Tutor topic: travel', 'New phrases: 12'] },
            },
            {
                title: 'Turn fluency into visible progress',
                body: 'See comprehension time, recall, speaking reps, and study consistency roll up to the fluency goal.',
                visual: { type: 'metrics', rows: ['Listening +22%', 'Cards mature 68%', 'Speaking sessions 14', 'Study streak 11'] },
            },
        ],
    },
];

const featureNames = ['Goal Trees', 'Programs', 'Sessions', 'Analytics'];

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
                ? 'You are on the private beta request list.'
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
                    <a href="#beta">Private beta</a>
                    <a href="https://my.fractalgoals.com">Open app</a>
                </nav>
            </header>

            <section className={styles.hero} aria-labelledby="landing-title">
                <div className={styles.kicker}>Fully composable goal achievement</div>
                <h1 id="landing-title">Want to achieve your goals? Start by making them smaller.</h1>
                <h2>
                    Fractal Goals is a fully-composable goal achievement platform. Set your goals, build
                    programs towards them, track your progress through sessions, activities, and metrics.
                </h2>
                <div className={styles.heroActions}>
                    <a className={styles.primaryAction} href="#beta">Request beta access</a>
                    <a className={styles.secondaryAction} href="https://my.fractalgoals.com">Go to app</a>
                </div>
            </section>

            <section className={styles.treeSection} id="examples" aria-labelledby="examples-title">
                <div className={styles.sectionHeader}>
                    <span>Example fractals</span>
                    <h2 id="examples-title">{selectedExample.root}</h2>
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
                            {example.root}
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
                    <span>Feature carousel</span>
                    <h2 id="features-title">See the same system from different angles.</h2>
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

            <section className={styles.betaSection} id="beta" aria-labelledby="beta-title">
                <div className={styles.betaCopy}>
                    <span>Private beta</span>
                    <h2 id="beta-title">Help test the next version of goal software.</h2>
                    <p>
                        Beta access is invite-based while the product is being shaped. Share what you
                        want to organize and we will follow up with testers who match the current build.
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
