import { useMemo } from 'react';

import { useOutbox } from '../offline/OutboxContext';
import { SESSION_OP, applyOptimistic } from '../offline/sessionOpHandlers';
import {
    activeWorkConflictError,
    buildInstanceUpdateRequest,
    buildPlaceholderInstance,
    findRunningInstance,
    instanceCoalesceKey,
    nowIso,
} from '../offline/sessionOps';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';
import { cloneMetricRows, cloneSetRows, getSectionItems, withSectionItems } from './sessionItemMutationUtils';

function newId() {
    return crypto.randomUUID();
}

function insertActivityItem(sessionData, sectionIndex, instanceId, afterInstanceId = null) {
    if (!sessionData?.sections?.[sectionIndex]) return sessionData;
    const sections = [...sessionData.sections];
    const section = { ...sections[sectionIndex] };
    const items = getSectionItems(section).filter((item) => !(
        item?.type === 'activity' && item.activity_instance_id === instanceId
    ));
    const afterIndex = afterInstanceId
        ? items.findIndex((item) => item?.type === 'activity' && item.activity_instance_id === afterInstanceId)
        : -1;
    const entry = { type: 'activity', activity_instance_id: instanceId };
    if (afterIndex >= 0) items.splice(afterIndex + 1, 0, entry);
    else items.push(entry);
    sections[sectionIndex] = withSectionItems(section, items);
    return { ...sessionData, sections };
}

/**
 * Device-first versions of the in-session writes. Each one patches the cache
 * immediately and persists an outbox op; the server confirms later. Returns
 * null when offline sync is disabled, so callers keep their direct path.
 */
export function useOfflineSessionWrites({
    rootId,
    sessionId,
    session,
    activities,
    groupMap,
    queryClient,
    sessionActivitiesKey,
    updateSessionDataDraft,
    setSessionDataDraft,
    setShowActivitySelector,
}) {
    const outbox = useOutbox();

    return useMemo(() => {
        if (!outbox || !rootId || !sessionId) return null;

        const cachedInstances = () => {
            const cached = queryClient.getQueryData(sessionActivitiesKey);
            return Array.isArray(cached) ? cached : [];
        };
        const findInstance = (instanceId) => cachedInstances().find((entry) => entry.id === instanceId) || null;

        const enqueue = async (kind, request, meta, options = {}) => {
            const op = {
                scope: sessionId,
                kind,
                method: request.method,
                url: request.url,
                body: request.body ?? null,
                coalesceKey: options.coalesceKey || null,
                entityIds: options.entityIds || [],
                creates: options.creates || [],
                meta: { rootId, sessionId, ...meta },
            };
            applyOptimistic(queryClient, op);
            return outbox.submit(op);
        };

        const updateInstance = async (instanceId, updates) => {
            const instance = findInstance(instanceId);
            if (!instance) return undefined;
            await enqueue(
                SESSION_OP.INSTANCE_UPDATE,
                buildInstanceUpdateRequest({ rootId, sessionId, instance, updates }),
                { instanceId, updates },
                { coalesceKey: instanceCoalesceKey(instanceId, updates), entityIds: [instanceId] },
            );
            return undefined;
        };

        const createInstance = async (sectionIndex, definition, { afterInstanceId = null } = {}) => {
            const id = newId();
            const placeholder = buildPlaceholderInstance({
                id,
                sessionId,
                rootId,
                definition,
                groupName: groupMap?.[definition.group_id]?.name || null,
            });
            updateSessionDataDraft((current) => insertActivityItem(current, sectionIndex, id, afterInstanceId));
            await enqueue(
                SESSION_OP.ACTIVITY_ADD,
                {
                    method: 'post',
                    url: `/${rootId}/sessions/${sessionId}/activities`,
                    body: { activity_definition_id: definition.id, section_index: sectionIndex, instance_id: id },
                },
                { instanceId: id, placeholder },
                { creates: [id] },
            );
            return placeholder;
        };

        const addActivity = async (sectionIndex, activityId, activityObject = null) => {
            const definition = activityObject || (activities || []).find((entry) => entry.id === activityId);
            if (!definition) return undefined;
            const placeholder = await createInstance(sectionIndex, definition);
            setShowActivitySelector((previous) => ({ ...previous, [sectionIndex]: false }));
            return placeholder;
        };

        const duplicateActivityInstance = async (sectionIndex, sourceInstanceId) => {
            const source = findInstance(sourceInstanceId);
            const definition = source && (
                (activities || []).find((entry) => entry.id === source.activity_definition_id)
                || { id: source.activity_definition_id, name: source.name, has_sets: source.has_sets, has_metrics: source.has_metrics }
            );
            if (!definition) return null;
            const placeholder = await createInstance(sectionIndex, definition, { afterInstanceId: sourceInstanceId });
            const sets = cloneSetRows(source.sets || [], { preserveCompletion: false });
            const metrics = cloneMetricRows(source.metrics || source.metric_values || []);
            if (sets.length > 0) await updateInstance(placeholder.id, { sets });
            if (metrics.length > 0) await updateInstance(placeholder.id, { metrics });
            notify.success('Activity instance duplicated');
            return placeholder;
        };

        const removeActivity = (instanceId) => {
            setSessionDataDraft((previous) => {
                if (!previous?.sections) return previous;
                return {
                    ...previous,
                    sections: previous.sections.map((section) => withSectionItems(
                        section,
                        getSectionItems(section).filter((item) => !(
                            item?.type === 'activity' && item.activity_instance_id === instanceId
                        )),
                    )),
                };
            });
            void enqueue(
                SESSION_OP.ACTIVITY_REMOVE,
                { method: 'delete', url: `/${rootId}/sessions/${sessionId}/activities/${instanceId}` },
                { instanceId },
                { entityIds: [instanceId] },
            );
        };

        const updateTimer = async (instanceId, action, extraData = {}) => {
            const instance = findInstance(instanceId);
            if (!instance) return;
            const occurredAt = nowIso();

            if (action === 'start') {
                const runningCircuit = (queryClient.getQueryData(queryKeys.sessionCircuitRuns(rootId, sessionId)) || [])
                    .find?.((run) => ['active', 'paused'].includes(run.status));
                if (runningCircuit) {
                    const message = 'Pause or complete the active circuit before starting an activity';
                    notify.error(`Timer action failed: ${message}`);
                    throw Object.assign(new Error(message), { response: { status: 409, data: { error: message } } });
                }
                const running = findRunningInstance(cachedInstances(), instanceId);
                if (running && !extraData.switch) throw activeWorkConflictError(running);
            }

            const request = action === 'start'
                ? {
                    method: 'post',
                    url: `/${rootId}/activity-instances/${instanceId}/start`,
                    body: {
                        session_id: sessionId,
                        activity_definition_id: instance.activity_definition_id,
                        ...extraData,
                        occurred_at: occurredAt,
                    },
                }
                : action === 'complete'
                    ? {
                        method: 'post',
                        url: `/${rootId}/activity-instances/${instanceId}/complete`,
                        body: { occurred_at: occurredAt },
                    }
                    : buildInstanceUpdateRequest({
                        rootId,
                        sessionId,
                        instance,
                        updates: {
                            time_start: null,
                            time_stop: null,
                            duration_seconds: null,
                            target_duration_seconds: null,
                            completed: false,
                        },
                    });
            const running = action === 'start' && extraData.switch
                ? findRunningInstance(cachedInstances(), instanceId)
                : null;
            await enqueue(
                SESSION_OP.TIMER,
                request,
                {
                    instanceId,
                    action,
                    occurredAt,
                    extraData,
                    sessionPaused: Boolean(session?.is_paused),
                },
                { entityIds: [instanceId, ...(running ? [running.id] : [])] },
            );
        };

        const sessionAction = (kind, path) => () => {
            const occurredAt = nowIso();
            return enqueue(
                kind,
                { method: 'post', url: `/${rootId}/timers/session/${sessionId}/${path}`, body: { occurred_at: occurredAt } },
                { occurredAt },
                { entityIds: [sessionId] },
            ).then(() => ({ data: queryClient.getQueryData(queryKeys.session(rootId, sessionId)) }));
        };

        const updateSession = async (updates) => {
            const occurredAt = nowIso();
            const body = { ...updates };
            if (updates.completed) body.occurred_at = occurredAt;
            const isDraftSave = Object.keys(updates).length === 1 && updates.session_data !== undefined;
            await enqueue(
                SESSION_OP.UPDATE,
                { method: 'put', url: `/${rootId}/sessions/${sessionId}`, body },
                { occurredAt },
                { entityIds: [sessionId], coalesceKey: isDraftSave ? `session:${sessionId}:data` : null },
            );
            return { data: queryClient.getQueryData(queryKeys.session(rootId, sessionId)) };
        };

        return {
            addActivity,
            duplicateActivityInstance,
            removeActivity,
            updateInstance,
            updateTimer,
            pauseSession: sessionAction(SESSION_OP.PAUSE, 'pause'),
            resumeSession: sessionAction(SESSION_OP.RESUME, 'resume'),
            updateSession,
        };
    }, [
        activities,
        groupMap,
        outbox,
        queryClient,
        rootId,
        session?.is_paused,
        sessionActivitiesKey,
        sessionId,
        setSessionDataDraft,
        setShowActivitySelector,
        updateSessionDataDraft,
    ]);
}

export default useOfflineSessionWrites;
