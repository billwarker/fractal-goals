export const baseAnalytics = {
    target: {
        id: 'target-1',
        name: 'Playthrough',
        metrics: [
            { metric_definition_id: 'speed', operator: '>=', target_value: 100 },
            { metric_definition_id: 'quality', operator: '>=', target_value: 8 },
        ],
    },
    activity_definition: {
        id: 'act-1',
        name: "She's Got It",
        has_metrics: true,
        metric_definitions: [
            { id: 'speed', name: 'Playback Speed', unit: '%', min_value: 0, max_value: 100 },
            { id: 'quality', name: 'Quality', unit: 'Rating', min_value: 0, max_value: 10 },
        ],
    },
    instances: [{
        id: 'inst-1',
        session_name: 'Practice 1',
        session_date: '2026-05-20T10:00:00.000Z',
        created_at: '2026-05-20T10:00:00.000Z',
        metrics: [
            { metric_definition_id: 'speed', value: 95 },
            { metric_definition_id: 'quality', value: 7 },
        ],
        sets: [],
    }],
    summary: {
        created_at: '2026-05-01T00:00:00.000Z',
        total_count: 1,
        last_instance_at: '2026-05-20T10:00:00.000Z',
        days_since_created: 30,
        completed: false,
        conditions: [
            { metric_definition_id: 'speed', metric_name: 'Playback Speed', unit: '%', operator: '>=', target_value: 100, best_value: 95, best_instance_id: 'inst-1', met_count: 0, first_met_at: null },
            { metric_definition_id: 'quality', metric_name: 'Quality', unit: 'Rating', operator: '>=', target_value: 8, best_value: 7, best_instance_id: 'inst-1', met_count: 0, first_met_at: null },
        ],
    },
};
