import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { updateCreatedSessionCaches } from '../utils/createdSessionCache';
import {
    addDraftActivities,
    buildQuickSessionPayload,
    createQuickDraft,
    moveDraftActivity,
    recordedValues,
    removeDraftActivity,
    setDraftItemValue,
} from '../utils/createSessionQuickDraft';
import { orderedSessionInstances } from '../utils/quickSessionSummary';
import { queryKeys } from './queryKeys';
import { addPendingQuickSession } from './useRecentQuickSessions';
import { hasQuickSessionInput, useQuickSessionCompletion } from './useQuickSessionCompletion';

/**
 * The quick session being logged on Create Session: adding, editing, reordering, removing
 * and repeating activities, and completing it. The draft lives only while the page is open:
 * leaving Create Session (or switching fractal) discards it.
 */
export function useQuickSessionComposer({ rootId, activityDefinitions }) {
    const queryClient = useQueryClient();
    // The draft belongs to the fractal it was started in.
    const [state, setState] = useState(() => ({ rootId, draft: createQuickDraft() }));
    const [completing, setCompleting] = useState(false);
    const { queueCompletion } = useQuickSessionCompletion({ rootId });
    const definitionById = useMemo(
        () => new Map((activityDefinitions || []).map((definition) => [definition.id, definition])),
        [activityDefinitions],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh empty draft per fractal
    const emptyDraft = useMemo(() => createQuickDraft(), [rootId]);
    const draft = state.rootId === rootId ? state.draft : emptyDraft;
    // The draft as of the last render: a value committed by blurring its field just before
    // completing reaches the draft after the click that completes it.
    const latestDraft = useRef(draft);
    useLayoutEffect(() => {
        latestDraft.current = draft;
    }, [draft]);

    const update = useCallback((change) => {
        setState((previous) => ({
            rootId,
            draft: change(previous.rootId === rootId ? previous.draft : createQuickDraft()),
        }));
    }, [rootId]);

    const addActivity = useCallback((definition) => update((current) => addDraftActivities(current, [{ definition }])), [update]);
    const removeActivity = useCallback((key) => update((current) => removeDraftActivity(current, key)), [update]);
    const moveActivity = useCallback(
        (index, direction) => update((current) => moveDraftActivity(current, index, direction)),
        [update],
    );
    const setActivityValue = useCallback(
        (key, value) => update((current) => setDraftItemValue(current, key, value)),
        [update],
    );

    /**
     * Replaces the quick session's activities with a past one's, each showing what was recorded last time.
     * Returns how many were left out because their activity no longer exists.
     */
    const repeat = useCallback((session) => {
        const instances = orderedSessionInstances(session);
        const entries = instances
            .map((instance) => ({
                definition: definitionById.get(instance.activity_definition_id),
                previous: recordedValues(instance),
            }))
            .filter((entry) => entry.definition);
        update(() => addDraftActivities(createQuickDraft(), entries));
        return instances.length - entries.length;
    }, [definitionById, update]);

    const reset = useCallback(() => update(() => createQuickDraft()), [update]);

    /**
     * Completes the draft: device first, through the outbox, so a dead zone never loses it.
     * Resolves to ``{ outcome, id }`` (outcome 'synced' | 'queued' | 'rejected'), or null.
     */
    const complete = useCallback(async () => {
        const draft = latestDraft.current;
        if (!hasQuickSessionInput(draft) || completing) return null;
        setCompleting(true);
        // An activity deleted since it was added is left out, as the section says.
        const logged = { ...draft, items: draft.items.filter((item) => definitionById.has(item.activity_definition_id)) };
        const payload = buildQuickSessionPayload(logged);
        try {
            const queued = await queueCompletion(payload);
            if (queued) {
                // A rejection is reported by the outbox and kept for review; the draft is done either way.
                if (queued.outcome === 'queued') {
                    addPendingQuickSession(queryClient, rootId, {
                        id: queued.id,
                        name: payload.name,
                        session_start: payload.session_start || new Date().toISOString(),
                        session_type: 'quick',
                        pending: true,
                        activity_instances: logged.items.map((item, index) => ({
                            id: item.key,
                            activity_definition_id: item.activity_definition_id,
                            name: item.name,
                            metrics: payload.activity_instances[index].metrics,
                            sets: payload.activity_instances[index].sets,
                        })),
                    });
                } else {
                    void queryClient.invalidateQueries({ queryKey: queryKeys.recentQuickSessions(rootId) });
                }
                reset();
                return queued;
            }

            const { data: completedSession } = await fractalApi.completeQuickSession(rootId, payload);
            updateCreatedSessionCaches(queryClient, rootId, completedSession);
            void queryClient.invalidateQueries({ queryKey: queryKeys.recentQuickSessions(rootId) });
            reset();
            return { outcome: 'synced', id: completedSession.id };
        } finally {
            setCompleting(false);
        }
    }, [completing, definitionById, queueCompletion, queryClient, reset, rootId]);

    return {
        draft,
        completing,
        addActivity,
        removeActivity,
        moveActivity,
        setActivityValue,
        repeat,
        complete,
    };
}

export default useQuickSessionComposer;
