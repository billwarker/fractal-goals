"""Request models of the endpoints that validate inside the view instead of with ``validate_request``."""
import validators as v


def inline_request_models():
    return {
        'activities.create_activity': v.ActivityDefinitionCreateSchema,
        'activities.update_activity': v.ActivityDefinitionUpdateSchema,
        'circuits.create_circuit': v.CircuitDefinitionCreateSchema,
        'circuits.update_circuit': v.CircuitDefinitionUpdateSchema,
        'circuits.create_circuit_run': v.CircuitRunCreateSchema,
        'circuits.update_circuit_run_timing': v.CircuitRunTimingUpdateSchema,
        'circuits.add_circuit_round': v.CircuitRoundCreateSchema,
        'circuits.update_circuit_member_metrics': v.CircuitMemberMetricsUpdateSchema,
        'circuits.cascade_circuit_member_metric': v.CircuitMemberMetricCascadeSchema,
        'circuits.mutate_circuit_run_tag': v.CircuitScopeTagMutationSchema,
        'circuits.mutate_circuit_round_tag': v.CircuitScopeTagMutationSchema,
        'timers.start_activity_timer': v.ActivityTimerStartSchema,
    }
