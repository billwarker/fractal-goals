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
