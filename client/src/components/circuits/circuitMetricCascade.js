import { isMetricValueEmpty } from '../../utils/sessionActivityMetrics';


export function canCascadeCircuitMetric(rounds, roundNumber, slotId, metricId, splitId = null) {
    const nextRound = (rounds || [])
        .filter((candidate) => candidate.round_number > roundNumber)
        .sort((left, right) => left.round_number - right.round_number)[0];
    const nextMember = (nextRound?.members || []).find(
        (candidate) => candidate.circuit_run_slot_id === slotId,
    );
    if (!nextMember) return false;
    const nextMetric = (nextMember.metrics || []).find((candidate) => (
        (candidate.metric_id || candidate.metric_definition_id) === metricId
        && (candidate.split_id || candidate.split_definition_id || null) === splitId
    ));
    return isMetricValueEmpty(nextMetric?.value);
}
