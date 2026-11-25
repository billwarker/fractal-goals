import { queryKeys } from '../hooks/queryKeys';
import {
    insertGoalIntoTree, refreshGoalReadModels, replaceGoalInList, replaceGoalInTree,
} from '../utils/goalTreeCache';
import notify from '../utils/notify';
import { syncApi } from '../utils/api/syncApi';
import { isLandedData } from './landedData';
import { RECORD_OP } from './opKinds';
import { recordScope } from './recordQueue';

const RECORD_PREFIXES = new Set(['fractalTree', 'goals-tree', 'goals', 'goalsForSelection', 'goal-notes']);

const patchTrees = (queryClient, rootId, patch) => {
    [queryKeys.fractalTree(rootId), queryKeys.goalsTree(rootId)].forEach((queryKey) => {
        queryClient.setQueryData(queryKey, (tree) => (tree ? patch(tree) : tree));
    });
};

const patchNoteLists = (queryClient, queryKey, patch) => {
    queryClient.setQueriesData({ queryKey }, (notes) => (Array.isArray(notes) ? patch(notes) : notes));
};

const OPTIMISTIC = {
    [RECORD_OP.GOAL_CREATE]: (queryClient, { meta }) => {
        patchTrees(queryClient, meta.rootId, (tree) => insertGoalIntoTree(tree, meta.placeholder));
    },
    [RECORD_OP.GOAL_UPDATE]: (queryClient, { meta }) => {
        const updated = { ...meta.updates, id: meta.goalId };
        patchTrees(queryClient, meta.rootId, (tree) => replaceGoalInTree(tree, updated));
        [queryKeys.goals(meta.rootId), queryKeys.goalsForSelection(meta.rootId)].forEach((queryKey) => {
            queryClient.setQueryData(queryKey, (list) => replaceGoalInList(list, updated));
        });
    },
    [RECORD_OP.NOTE_CREATE]: (queryClient, { meta }) => {
        patchNoteLists(queryClient, ['goal-notes', meta.rootId, meta.goalId], (notes) => (
            notes.some((note) => note.id === meta.note.id) ? notes : [meta.note, ...notes]
        ));
    },
    [RECORD_OP.NOTE_UPDATE]: (queryClient, { meta }) => {
        patchNoteLists(queryClient, queryKeys.goalNotesRoot(meta.rootId), (notes) => (
            notes.map((note) => (note.id === meta.noteId ? { ...note, content: meta.content } : note))
        ));
    },
    [RECORD_OP.NOTE_DELETE]: (queryClient, { meta }) => {
        patchNoteLists(queryClient, queryKeys.goalNotesRoot(meta.rootId), (notes) => (
            notes.filter((note) => note.id !== meta.noteId)
        ));
    },
};

export function registerRecordOpHandlers(outbox, queryClient) {
    const applyOptimistic = (op) => OPTIMISTIC[op.kind]?.(queryClient, op);
    const reapply = (scope) => outbox.pendingOps(scope).forEach(applyOptimistic);
    let pendingRoots = new Set();

    const announceConflicts = async () => {
        const before = queryClient.getQueryData(queryKeys.syncConflicts()) || [];
        const { conflicts } = (await syncApi.getConflicts()).data;
        queryClient.setQueryData(queryKeys.syncConflicts(), conflicts);
        const known = new Set(before.map((conflict) => conflict.id));
        if (conflicts.some((conflict) => !known.has(conflict.id))) {
            notify.warning('Something you edited was also edited on another device. Review it in Settings → Sync.');
        }
    };

    const refresh = (rootId) => {
        void refreshGoalReadModels(queryClient, queryKeys, rootId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.goalNotesRoot(rootId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) });
        // Losing the notice only: the conflict stays listed in Settings.
        announceConflicts().catch(() => {});
    };

    const unregister = Object.values(RECORD_OP).map((kind) => outbox.registerHandler(kind, {
        optimistic: applyOptimistic,
        onReject: (_op, error) => notify.error(`A change couldn't be saved: ${error?.message || 'the server rejected it'}`),
    }));

    // Data that lands while changes are queued must not hide them.
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
        if (!isLandedData(event)) return;
        const [prefix, rootId] = event.query.queryKey || [];
        if (RECORD_PREFIXES.has(prefix) && outbox.hasPending(recordScope(rootId))) reapply(recordScope(rootId));
    });

    const unsubscribeOutbox = outbox.subscribe(() => {
        const next = new Set(outbox.pendingOps().filter((op) => op.kind.startsWith('record.')).map((op) => op.meta.rootId));
        pendingRoots.forEach((rootId) => {
            if (!next.has(rootId)) refresh(rootId);
        });
        pendingRoots = next;
    });

    void outbox.ready().then(() => {
        outbox.pendingOps().filter((op) => op.kind.startsWith('record.')).forEach(applyOptimistic);
    });

    return () => {
        unregister.forEach((off) => off());
        unsubscribeCache();
        unsubscribeOutbox();
    };
}
