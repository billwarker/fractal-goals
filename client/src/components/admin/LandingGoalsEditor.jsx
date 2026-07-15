import React from 'react';

const DEFAULTS = [
    { key: 'break_down', heading: 'Break it down', body: 'Turn ambitious outcomes into achievable child goals. Map the journey one step at a time—and build momentum every time you complete one.' },
    { key: 'associate_activities', heading: 'Connect your work to your goals', body: 'Attach activities as evidence of progress. Each completed activity advances the goal it supports and carries that evidence up through its lineage.' },
    { key: 'set_targets', heading: 'Set measurable targets', body: 'Define performance targets for the activities behind each goal, then see your progress build over time.' },
];

export const LANDING_CONTENT_TABS = ['goals', 'sessions', 'activities', 'programs', 'analytics'];
export const normalizeLandingContent = (content) => {
    const byKey = new Map((content?.goals?.bullets || []).map((bullet) => [bullet.key, bullet]));
    return { goals: { bullets: DEFAULTS.map((defaults) => ({
        ...defaults, ...(byKey.get(defaults.key) || {}), goal_id: byKey.get(defaults.key)?.goal_id || null,
        target_id: defaults.key === 'set_targets' ? (byKey.get(defaults.key)?.target_id || null) : null,
    })) } };
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
            return [
                ...(!bullet.goal_id ? [`${name}: select an example goal`] : []),
                ...(bullet.key === 'set_targets' && !bullet.target_id
                    ? [`${name}: select an example target`]
                    : []),
            ];
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
            const goalOptions = bullet.key === 'set_targets'
                ? (options?.goals || []).filter((goal) => goal.targets.length > 0) : (options?.goals || []);
            const selectedGoal = (options?.goals || []).find((goal) => goal.id === bullet.goal_id);
            return <fieldset className={styles.landingGoalBullet} key={bullet.key}>
                <legend>Bullet {index + 1}</legend>
                <label><span>Heading</span><input value={bullet.heading} maxLength={100}
                    onChange={(event) => update(bullet.key, { heading: event.target.value })} /></label>
                <label><span>Content</span><textarea value={bullet.body} maxLength={600} rows={3}
                    onChange={(event) => update(bullet.key, { body: event.target.value })} /></label>
                <label><span>{bullet.key === 'set_targets' ? 'Goal with targets' : 'Example goal'}</span>
                    <select aria-label={`Example goal for ${bullet.heading}`} value={bullet.goal_id || ''}
                        onChange={(event) => update(bullet.key, { goal_id: event.target.value || null, target_id: null })}>
                        <option value="">Select a goal…</option>
                        {goalOptions.map((goal) => <option value={goal.id} key={goal.id}>
                            {goal.name}{goal.level_name ? ` — ${goal.level_name}` : ''}
                        </option>)}
                    </select>
                </label>
                {bullet.key === 'set_targets' && bullet.goal_id && <label><span>Example target</span>
                    <select aria-label={`Example target for ${bullet.heading}`} value={bullet.target_id || ''}
                        onChange={(event) => update(bullet.key, { target_id: event.target.value || null })}>
                        <option value="">Select a target…</option>
                        {(selectedGoal?.targets || []).map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}
                    </select>
                </label>}
                <p className={styles.landingInteractionHint}>
                    {bullet.key === 'break_down' && 'Opens this goal, focuses its lineage, and shows Goal Details.'}
                    {bullet.key === 'associate_activities' && 'Opens this goal directly on its Activities view.'}
                    {bullet.key === 'set_targets' && 'Opens the selected target in the read-only analytics manager modal.'}
                </p>
            </fieldset>;
        })}
    </div>;
}
