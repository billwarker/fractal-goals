// The queue inside a native shell: a file the shell owns, which the system never clears to free
// space as it may a web view's storage. Every command resolves only once the change is on disk.

import { getShell } from '../platform';

export function createShellStore(userId) {
    // In the order asked: the shell runs commands side by side, and two saves of one change must not swap.
    let last = Promise.resolve();
    const call = (command, args = {}) => {
        const next = last.then(() => getShell().invoke(`queue_${command}`, { userId, ...args }));
        last = next.catch(() => {});
        return next;
    };
    return {
        getAll: async () => (await call('all')).map((value) => JSON.parse(value)),
        put: (op) => call('put', { opId: op.opId, value: JSON.stringify(op) }),
        delete: (opId) => call('delete', { opId }),
        clear: () => call('clear'),
        isVolatile: () => false,
    };
}
