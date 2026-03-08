def check_metric_value(target_value, actual_value, operator):
    try:
        target_float = float(target_value)
        actual_float = float(actual_value)
    except (TypeError, ValueError):
        return False

    if operator == '>=':
        return actual_float >= target_float
    if operator == '<=':
        return actual_float <= target_float
    if operator in ('==', '='):
        return abs(actual_float - target_float) < 0.001
    if operator == '>':
        return actual_float > target_float
    if operator == '<':
        return actual_float < target_float
    return False


def check_metrics_meet_target(target_metrics, actual_metrics):
    if not target_metrics:
        return False

    actual_map = {}
    for metric in actual_metrics:
        metric_id = metric.get('metric_id') or metric.get('metric_definition_id')
        if metric_id and metric.get('value') is not None:
            actual_map[metric_id] = metric['value']

    for target_metric in target_metrics:
        metric_id = target_metric.get('metric_id') or target_metric.get('metric_definition_id')
        target_value = target_metric.get('value', target_metric.get('target_value'))
        operator = target_metric.get('operator', '>=')

        if not metric_id or target_value is None:
            continue

        actual_value = actual_map.get(metric_id)
        if actual_value is None:
            return False

        if not check_metric_value(target_value, actual_value, operator):
            return False

    return True
