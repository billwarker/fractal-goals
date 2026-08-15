# Interactive session detail renders circuit work by round. Keep authoring
# limits intentionally below the database's defensive ceiling so payload and
# DOM size remain predictable on mobile and lower-powered devices.
MAX_CIRCUIT_ROUNDS = 100
MAX_CIRCUIT_SLOTS = 50
MAX_CIRCUIT_RESULTS = 1000

# Conservative storage estimate for the round member plus its activity set or
# activity instance and initial supporting rows. The storage quota service uses
# this before the database write occurs.
ESTIMATED_CIRCUIT_RESULT_BYTES = 512


def validate_circuit_slot_count(slot_count):
    if slot_count > MAX_CIRCUIT_SLOTS:
        return (
            f"A circuit cannot contain more than {MAX_CIRCUIT_SLOTS} "
            "activity slots"
        )
    return None


def validate_circuit_shape(round_count, slot_count):
    if round_count > MAX_CIRCUIT_ROUNDS:
        return (
            f"A circuit cannot contain more than {MAX_CIRCUIT_ROUNDS} rounds"
        )
    slot_error = validate_circuit_slot_count(slot_count)
    if slot_error:
        return slot_error
    result_count = round_count * slot_count
    if result_count > MAX_CIRCUIT_RESULTS:
        return (
            f"A circuit cannot generate more than {MAX_CIRCUIT_RESULTS} "
            "round activity results"
        )
    return None
