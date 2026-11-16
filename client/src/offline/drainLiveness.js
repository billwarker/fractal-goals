// Is the tab holding the drain lock still alive? A frozen tab (backgrounded on a phone,
// or by the browser to save energy) keeps its Web Lock but runs no code, so a ping over
// the user's BroadcastChannel goes unanswered. A live holder answers even while it
// waits on a request. Idempotency keys make a takeover safe if the frozen tab wakes
// with a request in flight.

export const PONG_TIMEOUT_MS = 3000;

export function createDrainLiveness({ channel, createId, setTimer, clearTimer }) {
    let holding = false;
    const waiting = new Map();

    const post = (message) => {
        try {
            channel?.postMessage(message);
        } catch {
            // A closed channel just means no answer.
        }
    };

    return {
        setHolding(next) {
            holding = next;
        },
        isHolding: () => holding,
        /** Answers liveness messages; false for any other message. */
        handle(message) {
            if (message?.type === 'drain-ping') {
                if (holding) post({ type: 'drain-pong', nonce: message.nonce });
                return true;
            }
            if (message?.type === 'drain-pong') {
                waiting.get(message.nonce)?.();
                return true;
            }
            return false;
        },
        /** Resolves false when nobody holding the drain answers in time; null without a channel to ask on. */
        isHolderAlive() {
            if (!channel) return Promise.resolve(null);
            const nonce = createId();
            return new Promise((resolve) => {
                const timer = setTimer(() => {
                    waiting.delete(nonce);
                    resolve(false);
                }, PONG_TIMEOUT_MS);
                waiting.set(nonce, () => {
                    clearTimer(timer);
                    waiting.delete(nonce);
                    resolve(true);
                });
                post({ type: 'drain-ping', nonce });
            });
        },
    };
}
