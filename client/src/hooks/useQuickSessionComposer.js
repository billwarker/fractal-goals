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
    upgradeQuickDraft,
} from '../utils/createSessionQuickDraft';
import { orderedSessionInstances } from '../utils/quickSessionSummary';
import { queryKeys } from './queryKeys';
import { addPendingQuickSession } from './useRecentQuickSessions';
import { hasQuickSessionInput, useQuickSessionPersistence } from './useQuickSessionPersistence';

/**
 * The quick session being logged on Create Session: its draft (kept on the device),
 * adding, editing, reordering, removing and repeating activities, and completing it.
 *
 * ``draft`` is always defined: until the user changes something it is the unfinished draft
 * saved on this device, or a new empty one.
 */
export function useQuickSessionComposer({ rootId, userId, activityDefinitions }) {
    const queryClient = useQueryClient();
    const [editedDraft, setEditedDraft] = useState(null);
    const [completing, setCompleting] = useState(false);
    const persistence = useQuickSessionPersistence({ rootId, userId, draft: editedDraft });
    const definitionById = useMemo(
        () => new Map((activityDefinitions || []).map((definition) => [definition.id, definition])),
        [activityDefinitions],
    );
    const resumedDraft = useMemo(() => upgradeQuickDraft(persistence.savedDraft?.draft), [persistence.savedDraft]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh empty draft per fractal
    const emptyDraft = useMemo(() => createQuickDraft(), [rootId]);
    const baseDraft = resumedDraft || emptyDraft;
    const draft = editedDraft || baseDraft;
    // The draft as of the last render: a value committed by blurring its field just before
    // completing reaches the draft after the click that completes it.
    const latestDraft = useRef(draft);
    useLayoutEffect(() => {
        latestDraft.current = draft;
    }, [draft]);

    // The first change starts from the resumed or empty draft.
    const update = useCallback((change) => {
        setEditedDraft((previous) => change(previous || baseDraft));
    }, [baseDraft]);

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

    const reset = useCallback(async () => {
        setEditedDraft(createQuickDraft());
        await persistence.clearDraft();
    }, [persistence]);

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
            const queued = await persistence.queueCompletion(payload);
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
                await reset();
                return queued;
            }

            const { data: completedSession } = await fractalApi.completeQuickSession(rootId, payload);
            updateCreatedSessionCaches(queryClient, rootId, completedSession);
            void queryClient.invalidateQueries({ queryKey: queryKeys.recentQuickSessions(rootId) });
            await reset();
            return { outcome: 'synced', id: completedSession.id };
        } finally {
            setCompleting(false);
        }
    }, [completing, definitionById, persistence, queryClient, reset, rootId]);

    return {
        draft,
        // An unfinished draft from an earlier visit, not yet picked up.
        hasUnfinishedDraft: !editedDraft && hasQuickSessionInput(resumedDraft),
        savedAt: persistence.savedDraft?.savedAt || null,
        completing,
        addActivity,
        removeActivity,
        moveActivity,
        setActivityValue,
        repeat,
        discard: reset,
        complete,
    };
}

export default useQuickSessionComposer;
