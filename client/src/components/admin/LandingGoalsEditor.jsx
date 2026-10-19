import React from 'react';

const DEFAULTS = [
    { key: 'break_down', heading: 'Break it down', body: 'Turn ambitious outcomes into achievable child goals. Map the journey one step at a time—and build momentum every time you complete one.' },
    { key: 'associate_activities', heading: 'Connect your work to your goals', body: 'Attach activities as evidence of progress. Each completed activity advances the goal it supports and carries that evidence up through its lineage.' },
    { key: 'set_conditions', heading: 'Know when you’re done', body: 'Give each goal a clear finish line: an activity threshold, all of its child goals, or your call. Progress builds toward it on its own.' },
];

// Settings saved before conditions replaced targets used the 'set_targets' key.
const LEGACY_KEYS = { set_targets: 'set_conditions' };

export const LANDING_CONTENT_TABS = ['goals', 'sessions', 'activities', 'programs', 'analytics'];
export const normalizeLandingContent = (content) => {
    const byKey = new Map((content?.goals?.bullets || []).map((bullet) => [LEGACY_KEYS[bullet.key] || bullet.key, bullet]));
    return { goals: { bullets: DEFAULTS.map((defaults) => {
        const saved = byKey.get(defaults.key) || {};
        return {
            key: defaults.key,
            heading: saved.heading || defaults.heading,
            body: saved.body || defaults.body,
            goal_id: saved.goal_id || null,
        };
    }) } };
};

export const getLandingContentDraftIssues = (content) => {
    const bullets = normalizeLandingContent(content).goals.bullets;
    return bullets.flatMap((bullet, index) => {
        const name = bullet.heading.trim() || `Bullet ${index + 1}`;
        return [
            ...(!bullet.heading.trim() ? [`${name}: add a heading`] : []),
            ...(!bullet.body.trim() ? [`${name}: add content`] : []),
        ];
    });
};

export const getLandingContentPublishIssues = (content) => {
    const bullets = normalizeLandingContent(content).goals.bullets;
    return [
        ...getLandingContentDraftIssues(content),
        ...bullets.flatMap((bullet, index) => {
            const name = bullet.heading.trim() || `Bullet ${index + 1}`;
            return !bullet.goal_id ? [`${name}: select an example goal`] : [];
        }),
    ];
};

export const getLandingExamplePublishIssues = (example) => [
    ...(!String(example?.label || '').trim() ? ['Add a public label'] : []),
    ...getLandingContentPublishIssues(example?.landing_content),
];

export default function LandingGoalsEditor({ content, onChange, options, styles }) {
    const draft = normalizeLandingContent(content);
    const update = (key, patch) => onChange({ goals: { bullets: draft.goals.bullets.map((bullet) => (
        bullet.key === key ? { ...bullet, ...patch } : bullet
    )) } });
    return <div className={styles.landingGoalBullets}>
        {draft.goals.bullets.map((bullet, index) => {
            const goalOptions = bullet.key === 'set_conditions'
                ? (options?.goals || []).filter((goal) => goal.has_activity_condition) : (options?.goals || []);
            return <fieldset className={styles.landingGoalBullet} key={bullet.key}>
                <legend>Bullet {index + 1}</legend>
                <label><span>Heading</span><input value={bullet.heading} maxLength={100}
                    onChange={(event) => update(bullet.key, { heading: event.target.value })} /></label>
                <label><span>Content</span><textarea value={bullet.body} maxLength={600} rows={3}
                    onChange={(event) => update(bullet.key, { body: event.target.value })} /></label>
                <label><span>{bullet.key === 'set_conditions' ? 'Goal with an activity threshold' : 'Example goal'}</span>
                    <select aria-label={`Example goal for ${bullet.heading}`} value={bullet.goal_id || ''}
                        onChange={(event) => update(bullet.key, { goal_id: event.target.value || null })}>
                        <option value="">Select a goal…</option>
                        {goalOptions.map((goal) => <option value={goal.id} key={goal.id}>
                            {goal.name}{goal.level_name ? ` — ${goal.level_name}` : ''}
                        </option>)}
                    </select>
                </label>
                <p className={styles.landingInteractionHint}>
                    {bullet.key === 'break_down' && 'Opens this goal, focuses its lineage, and shows Goal Details.'}
                    {bullet.key === 'associate_activities' && 'Opens this goal directly on its Activities view.'}
                    {bullet.key === 'set_conditions' && 'Opens this goal’s details, where its threshold progress and evidence are shown.'}
                </p>
            </fieldset>;
        })}
    </div>;
}
