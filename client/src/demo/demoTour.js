import { getGoalNodeId } from '../utils/goalNodeModel';
import { findFirstGoalByType } from '../utils/landingPageModel';

// The guided walkthrough, in order. Each step opens a real page and points at a real
// element (`anchor`, a selector); deep links use the admin's showcase picks from the
// published snapshot so every example opens on its best data.

const firstGoalWorthOpening = (tree) => (
    findFirstGoalByType(tree, 'ShortTermGoal')
    || findFirstGoalByType(tree, 'MidTermGoal')
    || findFirstGoalByType(tree, 'LongTermGoal')
    || tree
);

export function buildTourSteps(example) {
    const rootId = example?.root_id;
    const showcase = example?.showcase || {};
    const goalId = getGoalNodeId(firstGoalWorthOpening(example?.tree));
    const sessionId = showcase.session_id || example?.sessions?.[0]?.id || null;
    const programId = showcase.program_id || example?.programs?.[0]?.id || null;
    const base = `/${rootId}`;

    return [
        {
            id: 'tree',
            title: 'One ambition, broken down',
            body: 'The big goal sits at the top and branches into goals you can actually work on. Each level gets its own shape and colour.',
            path: `${base}/goals`,
            anchor: '.react-flow',
        },
        {
            id: 'goal',
            title: 'Inside a goal',
            body: 'Every goal keeps its timeline, the activities that count toward it, and the condition that marks it done.',
            path: goalId ? `${base}/goals?goal=${encodeURIComponent(goalId)}` : `${base}/goals`,
            anchor: '[data-tour="goal-detail"]',
        },
        {
            id: 'sessions',
            title: 'Every session, logged',
            body: 'Sessions are the real work. Each one records what was done and credits the goals it served.',
            path: `${base}/sessions`,
            anchor: '[data-tour="sessions"]',
        },
        {
            id: 'session',
            title: 'Inside a session',
            body: 'Activities with sets, metrics, timers and notes in one record. Completed work flows straight up the tree.',
            path: sessionId ? `${base}/session/${sessionId}` : `${base}/sessions`,
            anchor: sessionId ? '[data-session-detail-content]' : '[data-tour="sessions"]',
        },
        {
            id: 'activities',
            title: 'Activities and metrics',
            body: 'Define what you practise once, with how you measure it, and reuse it in every session.',
            path: `${base}/manage-activities`,
            anchor: '[data-tour="activities"]',
        },
        {
            id: 'programs',
            title: 'Programs on a calendar',
            body: 'Plan training blocks and put session templates on real dates. Completion fills itself in as sessions are logged.',
            path: programId ? `${base}/programs/${programId}` : `${base}/programs`,
            anchor: '[data-tour="programs"]',
        },
        {
            id: 'analytics',
            title: 'See whether it’s working',
            body: 'Charts come straight from the logged sessions: trends, time per activity, progress on every metric.',
            path: `${base}/analytics`,
            anchor: '[data-tour="analytics"]',
        },
        {
            id: 'notes',
            title: 'Notes in context',
            body: 'Notes attach to goals, sessions and activities, and come together on one searchable timeline.',
            path: `${base}/notes`,
            anchor: '[data-tour="notes"]',
        },
        {
            id: 'yours',
            title: 'Make it yours',
            body: 'That’s the tour. Switch examples to see other kinds of goals, keep exploring, or sign up to build your own tree.',
            path: null,
            anchor: null,
        },
    ];
}
