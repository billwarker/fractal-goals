// Shapes shared by the outbox and its stores, for checkJs (tsconfig.typecheck.json).
// Types only: this module has no runtime code.

/**
 * @typedef {object} OutboxOp One queued write, persisted until the server acknowledges it.
 * @property {number} [v] Op shape version (OP_VERSION); missing means 1.
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
 * @property {number} [sendingUntil] While in the future, the op is being sent, so nothing may coalesce or cancel it.
 * @property {boolean} [bodyPrepared] `body` is final: retries must send exactly this.
 */

/**
 * @typedef {object} OutboxSnapshot What the sync indicator reads (`getSnapshot`).
 * @property {OutboxOp[]} ops
 * @property {boolean} syncing A flush is running in this tab.
 * @property {boolean} pausedForAuth Waiting for sign-in to be renewed.
 * @property {boolean} volatile The device store failed, so queued changes live only in this tab for now.
 * @property {boolean} waitingForTab A drain here waits for another tab's drain lock.
 * @property {Record<string, number>} syncedAt When each scope last emptied.
 */

/**
 * @typedef {object} OutboxStore Durable op store (indexedDbStore, or memoryStore in tests).
 * @property {() => Promise<OutboxOp[]>} getAll
 * @property {(op: OutboxOp) => Promise<void>} put
 * @property {(opId: string) => Promise<void>} delete
 * @property {() => Promise<void>} [clear]
 * @property {() => boolean} [isVolatile] True while ops are held in memory because the durable store failed.
 */

/**
 * @typedef {object} OutboxOptions `store` and `send` are required; createOutbox checks them.
 * @property {OutboxStore} [store]
 * @property {(op: OutboxOp) => Promise<unknown>} [send] Delivers one op to the server.
 * @property {() => boolean} [isOnline]
 * @property {(callback: () => Promise<unknown>) => Promise<unknown>} [lock]
 * @property {(callback: () => Promise<unknown>, options?: { steal?: boolean }) => Promise<unknown>} [drainLock]
 * @property {(body: unknown) => unknown} [prepareBody]
 * @property {BroadcastChannel | null} [channel]
 * @property {() => number} [authGeneration] Changes whenever sign-in is renewed.
 * @property {() => number} [now]
 * @property {() => number} [random]
 * @property {() => string} [createId]
 * @property {(callback: () => void, delay: number) => ReturnType<typeof setTimeout>} [setTimer]
 * @property {(handle: ReturnType<typeof setTimeout>) => void} [clearTimer]
 * @property {(type: string, payload?: unknown) => void} [onEvent]
 */

export {};
