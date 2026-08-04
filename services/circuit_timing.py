from datetime import datetime, timezone


def parse_circuit_time(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def finish_circuit_clock(entity, now):
    if entity.is_paused and entity.last_paused_at:
        entity.total_paused_seconds += max(0, int((now - entity.last_paused_at).total_seconds()))
    entity.is_paused = False
    entity.last_paused_at = None
    entity.time_stop = now
    entity.duration_seconds = max(
        0,
        int((now - entity.time_start).total_seconds()) - (entity.total_paused_seconds or 0),
    ) if entity.time_start else 0
