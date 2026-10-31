// Shapes shared by the outbox and its stores, for checkJs (tsconfig.typecheck.json).
// Types only: this module has no runtime code.

/**
 * @typedef {object} OutboxOp One queued write, persisted until the server acknowledges it.
 * @property {string} opId
 * @property {string} idempotencyKey
 * @property {string | null} scope
 * @property {string} kind
 * @property {string} method
 * @property {string} url
 * @property {unknown} body
 * @property {string | null | undefined} coalesceKey
 * @property {string[]} entityIds
 * @property {string[]} creates
 * @property {object} [meta]
 * @property {number} seq
 * @property {number} attempts
 * @property {number} nextAttemptAt
 * @property {string} state One of OP_STATE.
 * @property {string} createdAt
 * @property {number} [serverFailures]
 * @property {number} [firstServerFailureAt]
 * @property {number} [rejectedAt]
 * @property {object | null} [error] Why the server rejected the op (shown for review).
 * @property {object | null} [lastError] The latest transient failure while retrying.
 */

/**
 * @typedef {object} OutboxStore Durable op store (indexedDbStore, or memoryStore in tests).
 * @property {() => Promise<OutboxOp[]>} getAll
 * @property {(op: OutboxOp) => Promise<void>} put
 * @property {(opId: string) => Promise<void>} delete
 * @property {() => Promise<void>} [clear]
 */

/**
 * @typedef {object} OutboxOptions `store` and `send` are required; createOutbox checks them.
 * @property {OutboxStore} [store]
 * @property {(op: OutboxOp) => Promise<unknown>} [send] Delivers one op to the server.
 * @property {() => boolean} [isOnline]
 * @property {(callback: () => Promise<unknown>) => Promise<unknown>} [lock]
 * @property {BroadcastChannel | null} [channel]
 * @property {() => number} [now]
 * @property {() => number} [random]
 * @property {() => string} [createId]
 * @property {(callback: () => void, delay: number) => ReturnType<typeof setTimeout>} [setTimer]
 * @property {(handle: ReturnType<typeof setTimeout>) => void} [clearTimer]
 * @property {(type: string, payload?: unknown) => void} [onEvent]
 */

export {};
