import { queryKeys } from '../hooks/queryKeys';

/**
 * Shows a chosen Progress pane chart at once: merges it into the cached series payloads for the
 * instance (every comparison scope of it). The server's resolved settings replace it on save.
 */
export function patchProgressChartSettings(queryClient, { rootId, activityId, instanceId, chartSettings }) {
    queryClient.setQueriesData(
        { queryKey: queryKeys.activityProgressTimeline(rootId, activityId, instanceId) },
        (data) => (data && 'chart_settings' in data
            ? { ...data, chart_settings: { ...data.chart_settings, ...chartSettings } }
            : data),
    );
}

const SAVED_INSTANCE_FIELDS = ['sets', 'metrics', 'completed', 'time_start', 'time_stop', 'duration_seconds', 'progress_comparison'];

/**
 * Moves the instance's point with its progress hints: writes a save response into the cached series
 * payloads for the instance (every comparison scope of it). The row keeps its session_date, which
 * session instances don't carry.
 */
export function patchProgressSeriesInstance(queryClient, { rootId, instance }) {
    if (!instance?.id || !instance.activity_definition_id) return;
    const saved = Object.fromEntries(SAVED_INSTANCE_FIELDS.filter((field) => field in instance).map((field) => [field, instance[field]]));
    queryClient.setQueriesData(
        { queryKey: queryKeys.activityProgressTimeline(rootId, instance.activity_definition_id, instance.id) },
        (data) => (Array.isArray(data?.instances)
            ? { ...data, instances: data.instances.map((row) => (row.id === instance.id ? { ...row, ...saved } : row)) }
            : data),
    );
}
