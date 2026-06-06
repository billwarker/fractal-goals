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

const features = [
    {
        title: 'Composable goal trees',
        body: 'Define goals from long-range direction down to the exact next action, then reshape the hierarchy as the work becomes clearer.',
    },
    {
        title: 'Session tracking',
        body: 'Turn goals into focused sessions with activities, notes, timers, templates, and repeatable practice structures.',
    },
    {
        title: 'Goal-aware analytics',
        body: 'See how sessions, programs, activities, targets, and notes roll back up through the goal system.',
    },
    {
        title: 'Programs and templates',
        body: 'Plan recurring work without losing the connection between today’s execution and the larger ambition.',
    },
    {
        title: 'Progress signals',
        body: 'Track completion, activity metrics, target movement, and timeline context from the same underlying model.',
    },
    {
        title: 'Private beta feedback loop',
        body: 'Early testers help shape workflows for serious practice, creative projects, training blocks, and complex personal systems.',
    },
];

const flowTreeDemo = {
    id: 'demo-root',
    name: 'Build a resilient practice system',
    type: 'UltimateGoal',
    is_smart: true,
    created_at: '2026-01-01T00:00:00Z',
    children: [
        {
            id: 'demo-performance',
            name: 'Performance foundation',
            type: 'LongTermGoal',
            is_smart: true,
            created_at: '2026-02-01T00:00:00Z',
            children: [
                {
                    id: 'demo-strength',
                    name: 'Strength block',
                    type: 'MidTermGoal',
                    created_at: '2026-03-01T00:00:00Z',
                    children: [
                        {
                            id: 'demo-lower-body',
                            name: 'Lower body session',
                            type: 'ImmediateGoal',
                            created_at: '2026-04-02T00:00:00Z',
                        },
                        {
                            id: 'demo-recovery-notes',
                            name: 'Recovery notes',
                            type: 'ImmediateGoal',
                            created_at: '2026-04-04T00:00:00Z',
                        },
                    ],
                },
                {
                    id: 'demo-skill',
                    name: 'Skill refinement',
                    type: 'MidTermGoal',
                    created_at: '2026-03-10T00:00:00Z',
                    children: [
                        {
                            id: 'demo-tempo',
                            name: 'Tempo drills',
                            type: 'ImmediateGoal',
                            created_at: '2026-04-08T00:00:00Z',
                        },
                    ],
                },
            ],
        },
        {
            id: 'demo-creative',
            name: 'Creative output',
            type: 'LongTermGoal',
            is_smart: true,
            created_at: '2026-02-12T00:00:00Z',
            children: [
                {
                    id: 'demo-composition',
                    name: 'Weekly composition',
                    type: 'ShortTermGoal',
                    created_at: '2026-04-12T00:00:00Z',
                    children: [
                        {
                            id: 'demo-motif',
                            name: 'Draft motif',
                            type: 'ImmediateGoal',
                            created_at: '2026-04-14T00:00:00Z',
                        },
                    ],
                },
            ],
        },
    ],
};

const initialFormState = {
    name: '',
    email: '',
    use_case: 'personal goals',
    note: '',
};

function Landing() {
    const [formState, setFormState] = useState(initialFormState);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');

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
                    <a href="#features">Features</a>
                    <a href="#beta">Private beta</a>
                    <a href="https://my.fractalgoals.com">Open app</a>
                </nav>
            </header>

            <section className={styles.hero} aria-labelledby="landing-title">
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>Fully composable goal systems</div>
                    <h1 id="landing-title">Define the work. Track the session. Understand the pattern.</h1>
                    <p>
                        Fractal Goals is built for people whose ambitions do not fit a flat checklist:
                        musicians, athletes, builders, researchers, founders, and anyone turning a long
                        arc into concrete practice.
                    </p>
                    <div className={styles.heroActions}>
                        <a className={styles.primaryAction} href="#beta">Request beta access</a>
                        <a className={styles.secondaryAction} href="https://my.fractalgoals.com">Go to app</a>
                    </div>
                </div>

                <div className={styles.composerPanel} aria-label="Goal hierarchy preview">
                    <div className={styles.panelHeader}>
                        <span>Goal hierarchy tree</span>
                        <span className={styles.statusPill}>Beta</span>
                    </div>
                    <div className={styles.flowTreePreview} aria-label="Example goal hierarchy tree">
                        <Suspense fallback={<div className={styles.flowTreeLoading}>Loading preview...</div>}>
                            <FlowTree
                                treeData={flowTreeDemo}
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
                        <div>
                            <strong>42h</strong>
                            <span>tracked</span>
                        </div>
                        <div>
                            <strong>17</strong>
                            <span>sessions</span>
                        </div>
                        <div>
                            <strong>86%</strong>
                            <span>aligned</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className={styles.visionBand}>
                <div className={styles.visionPanel}>
                    <span>Vision</span>
                    <p>
                        The core idea is simple: goals should compose like real life does. A single
                        session can serve an immediate task, reinforce a short-term target, support a
                        program, and still remain visible inside the larger direction.
                    </p>
                </div>
                <div className={styles.visionPanel}>
                    <span>System</span>
                    <p>
                        Goal defining, session tracking, and analytics share the same structure, so
                        planning and execution stop living in separate tools.
                    </p>
                </div>
            </section>

            <section className={styles.featuresSection} id="features" aria-labelledby="features-title">
                <div className={styles.sectionHeader}>
                    <span>Feature overview</span>
                    <h2 id="features-title">A workspace for goals that keep unfolding.</h2>
                </div>
                <div className={styles.featureGrid}>
                    {features.map((feature, index) => {
                        const level = goalLevels[index % goalLevels.length];
                        return (
                            <article className={styles.featureCard} key={feature.title}>
                                <GoalIcon
                                    shape={level.shape}
                                    color={level.color}
                                    secondaryColor={level.secondaryColor}
                                    isSmart={index % 2 === 0}
                                    size={28}
                                />
                                <h3>{feature.title}</h3>
                                <p>{feature.body}</p>
                            </article>
                        );
                    })}
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
