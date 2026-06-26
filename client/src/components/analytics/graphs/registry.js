import GoalDurationGraph from './GoalDurationGraph';

export const GRAPH_PROFILES = [
    {
        id: 'goalDuration',
        name: 'Goal Duration',
        description: 'Daily time spent from goal evidence',
        Chart: GoalDurationGraph,
    },
];

export function getGraphProfile(profileId) {
    return GRAPH_PROFILES.find((profile) => profile.id === profileId) || null;
}
