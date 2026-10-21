// Dependency-free names shared by the lazily loaded sync engine and the hooks
// that queue writes, so importing them never pulls the engine into a bundle.

export const OP_STATE = Object.freeze({
    PENDING: 'pending',
    REJECTED: 'rejected',
});

export const SESSION_OP = Object.freeze({
    INSTANCE_UPDATE: 'session.instance.update',
    ACTIVITY_ADD: 'session.activity.add',
    ACTIVITY_REMOVE: 'session.activity.remove',
    TIMER: 'session.timer',
    PAUSE: 'session.pause',
    RESUME: 'session.resume',
    UPDATE: 'session.update',
    NOTE_CREATE: 'session.note.create',
    NOTE_UPDATE: 'session.note.update',
    NOTE_DELETE: 'session.note.delete',
    CIRCUIT_RUN: 'session.circuit.run',
    CIRCUIT_MEMBER: 'session.circuit.member',
    QUICK_COMPLETE: 'session.quick.complete',
    CIRCUIT_CREATE: 'session.circuit.create',
    CIRCUIT_ROUND_ADD: 'session.circuit.round.add',
    CIRCUIT_ROUND_REMOVE: 'session.circuit.round.remove',
    CIRCUIT_CASCADE: 'session.circuit.cascade',
    CIRCUIT_TAG: 'session.circuit.tag',
    INSTANCE_TAGS: 'session.instance.tags',
    SET_TAGS: 'session.set.tags',
    PROGRESS_COMPARISON: 'session.instance.progress-comparison',
    INSTANCE_GOAL_LINK: 'session.instance.goal-link',
});
