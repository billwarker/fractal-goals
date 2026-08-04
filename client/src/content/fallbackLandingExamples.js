const fallbackLandingExamples = [{
    root_id: 'demo-guitar-root',
    label: 'Guitar practice tracker',
    root_name: 'Become a skilled guitar player',
    sort_order: 0,
    showcase: {
        session_id: 'demo-session-1',
        activity_ids: ['demo-activity-1'],
        program_id: 'demo-program-1',
        program_start_date: '2026-01-05',
        program_end_date: '2026-02-01',
        analytics_view_ids: ['demo-analytics-view-1'],
    },
    evidence_goal_ids: ['demo-guitar-musicianship', 'demo-guitar-caged'],
    metrics_summary: {
        'demo-guitar-root': { total_duration_seconds: 12600, session_count: 6 },
        'demo-guitar-caged': { total_duration_seconds: 3600, session_count: 3 },
    },
    programs: [{
        id: 'demo-program-1', name: 'Weekly musicianship block', color: '#3A86FF',
        start_date: '2026-01-05', end_date: '2026-02-01',
        goal_ids: ['demo-guitar-musicianship', 'demo-guitar-caged'],
        blocks: [{
            id: 'demo-block-1', name: 'Fretboard map', color: '#3A86FF',
            start_date: '2026-01-05', end_date: '2026-01-18', goal_ids: ['demo-guitar-caged'],
            days: [{
                id: 'demo-day-1', name: 'Triad practice',
                day_of_week: ['Monday', 'Wednesday', 'Friday'],
                templates: [{ id: 'demo-template-1', name: 'Triad Session', is_required: true }],
            }],
        }],
    }],
    sessions: [{
        id: 'demo-session-1', name: 'Triad Session', root_id: 'demo-guitar-root',
        session_start: '2026-01-12T18:00:00Z', session_end: '2026-01-12T18:45:00Z',
        duration_minutes: 45, total_duration_seconds: 2700, completed: true,
        attributes: {
            updated_at: '2026-01-12T18:45:00Z', completed: true,
            session_data: {
                session_start: '2026-01-12T18:00:00Z', session_end: '2026-01-12T18:45:00Z',
                sections: [{ name: 'Main', duration_minutes: 45, activity_ids: ['demo-instance-1'] }],
                notes: 'CAGED shapes are getting faster; B-string transitions still need attention.',
            },
        },
        activity_instances: [{
            id: 'demo-instance-1', activity_definition_id: 'demo-activity-1', name: 'CAGED Triads',
            duration_seconds: 2700, completed: true, sets: [],
            metrics: [{ metric_id: 'demo-metric-1', value: 36 }],
        }],
        completed_goals: [], stats: {},
    }],
    activity_definitions: [{
        id: 'demo-activity-1', name: 'CAGED Triads',
        description: 'Move triad shapes through the neck with clean naming.',
        has_metrics: true, has_sets: false,
        metric_definitions: [{ id: 'demo-metric-1', name: 'Reps', unit: 'clean changes' }],
        split_definitions: [], associated_goal_ids: ['demo-guitar-caged'],
        associated_goals: [{ id: 'demo-guitar-caged', name: 'Practice CAGED triads', type: 'ShortTermGoal' }],
    }],
    activity_groups: [],
    analytics_views: [{
        id: 'demo-analytics-view-1', name: 'Session Trends',
        layout: {
            version: 3,
            layout: { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] },
            window_states: {
                'window-1': {
                    selectedCategory: 'sessions', selectedVisualization: 'sessionTrends',
                    selectedActivity: null, selectedModeIds: [], selectedGoal: null,
                    visualizationState: { grain: 'week', metrics: ['sessions', 'duration'] },
                    visualizationStateByKey: {
                        'sessions:sessionTrends': { grain: 'week', metrics: ['sessions', 'duration'] },
                    },
                },
            },
            selected_window_id: 'window-1',
            global_filters: {
                goals: { goalIds: [], includeDescendants: true, includeInheritedActivities: true },
                activities: { activityIds: [], groupIds: [], includeChildren: true },
            },
            layout_bounds: { columns: 96, rows: 48 },
        },
    }],
    session_templates: [{
        id: 'demo-template-1', name: 'Triad Session',
        description: 'A reusable practice shape for fretboard work.', session_type: 'standard',
        template_data: {
            sections: [{
                name: 'Main', activities: [{ activity_id: 'demo-activity-1', name: 'CAGED Triads' }],
            }],
        },
    }],
    tree: {
        id: 'demo-guitar-root', name: 'Become a skilled guitar player', type: 'UltimateGoal',
        level: { id: 'demo-level-ultimate', name: 'Ultimate Goal', icon: 'twelvePointStar', color: '#4f9cf9', secondary_color: '#102235' },
        attributes: { id: 'demo-guitar-root', type: 'UltimateGoal', created_at: '2026-01-01T00:00:00Z', is_smart: true },
        children: [{
            id: 'demo-guitar-musicianship', name: 'Build complete musicianship', type: 'LongTermGoal',
            level: { id: 'demo-level-long', name: 'Long Term Goal', icon: 'hexagon', color: '#3bc57c', secondary_color: '#0f271c' },
            attributes: { id: 'demo-guitar-musicianship', type: 'LongTermGoal', created_at: '2026-01-01T00:00:00Z', is_smart: true },
            children: [{
                id: 'demo-guitar-fretboard', name: 'Map the fretboard', type: 'MidTermGoal',
                level: { id: 'demo-level-mid', name: 'Mid Term Goal', icon: 'diamond', color: '#f59f4d', secondary_color: '#2c1d0f' },
                attributes: { id: 'demo-guitar-fretboard', type: 'MidTermGoal', created_at: '2026-01-01T00:00:00Z' },
                children: [{
                    id: 'demo-guitar-caged', name: 'Practice CAGED triads', type: 'ShortTermGoal',
                    level: { id: 'demo-level-short', name: 'Short Term Goal', icon: 'triangle', color: '#8b6fff', secondary_color: '#181329' },
                    attributes: {
                        id: 'demo-guitar-caged', type: 'ShortTermGoal', created_at: '2026-01-01T00:00:00Z',
                        associated_activity_ids: ['demo-activity-1'],
                        associated_activities: [{
                            id: 'demo-activity-1', name: 'CAGED Triads',
                            metric_definitions: [{ id: 'demo-metric-1', name: 'Reps', unit: 'clean changes' }],
                        }],
                    },
                    children: [{
                        id: 'demo-guitar-session-goal', name: 'Complete one clean triad session', type: 'ImmediateGoal',
                        level: { id: 'demo-level-immediate', name: 'Immediate Goal', icon: 'circle', color: '#ef6a6a', secondary_color: '#301515' },
                        attributes: { id: 'demo-guitar-session-goal', type: 'ImmediateGoal', created_at: '2026-01-01T00:00:00Z' },
                        children: [],
                    }],
                }],
            }],
        }],
    },
}];

export default fallbackLandingExamples;
