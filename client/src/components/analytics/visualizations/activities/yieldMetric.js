import { yieldMetricIds } from '../../../../utils/setAggregation';

/** The pseudo-metric for the activity's yield (the product of its multiplicative metrics). */
export const YIELD_METRIC_ID = 'yield';

/** The activity's yield metric ids: from the payload when present, else derived like the server. */
export function activityYieldIds(activity) {
    return activity?.yield_metric_ids || yieldMetricIds(activity);
}
