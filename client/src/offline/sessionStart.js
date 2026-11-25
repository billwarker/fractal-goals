// Starts a session from a template with no signal. Every id the server would choose is chosen here
// instead (or derived the way the server derives it), so the session can be logged before it syncs.

import { queryKeys } from '../hooks/queryKeys';
import { buildPlaceholderRound, buildPlaceholderRun, placeholderCircuitInstances } from './circuitOps';
import { initialRoundId, plannedSetId } from './circuitIds';
import { SESSION_OP } from './opKinds';
import { defaultId as createId } from './outboxTransport';
import { buildPlaceholderInstance, nowIso } from './sessionOps';

const list = (value) => (Array.isArray(value) ? value : []);

function templatePrescriptions(template) {
    return new Map(list(template.template_data?.sections).flatMap((section) => (
        list(section.items || section.activities || section.exercises)
            .filter((item) => item?.item_key && item.prescription)
            .map((item) => [item.item_key, item.prescription])
    )));
}

async function buildInstance(item, { sessionId, definition, prescription, tags, groupName }) {
    const instance = buildPlaceholderInstance({ id: item.instance_id, sessionId, definition, groupName });
    if (!prescription) return instance;
    const planned = (ids) => list(ids).map((id) => tags.get(id)).filter(Boolean);
    const sets = definition.has_sets
        ? await Promise.all(list(prescription.sets).map(async (set, index) => ({
            id: await plannedSetId(instance.id, index),
            sort_order: index,
            status: 'planned',
            completed: false,
            duration_seconds: null,
            notes: null,
            metrics: [],
            tag_assignment_version: 1,
            tags: planned(set.tags),
            inherited_tags: planned(prescription.tags),
            effective_tags: [...planned(prescription.tags), ...planned(set.tags)],
        })))
        : [];
    return { ...instance, prescription, tags: planned(prescription.tags), sets };
}

async function buildRun(item, { sessionId, rootId, definition, prescription }) {
    const run = await buildPlaceholderRun(definition, { runId: item.circuit_run_id, sessionId, rootId });
    const count = Math.max(1, list(prescription?.rounds).length);
    const rounds = [...run.rounds];
    for (let number = 2; number <= count; number += 1) {
        rounds.push(await buildPlaceholderRound(run.slots, {
            roundId: await initialRoundId(run.id, number), roundNumber: number,
        }));
    }
    return { ...run, rounds, round_count: rounds.length, prescription: prescription || null };
}

/** The session, its activities and circuits as the server will have them, or null when something it uses isn't on this device. */
export async function buildOfflineSession({ rootId, userId, template, payload, definitions, circuits, tags, groupNames }) {
    const sessionId = createId();
    const prescriptions = templatePrescriptions(template);
    const instances = [];
    const runs = [];
    const bodySections = [];
    const sections = [];
    for (const section of list(payload.session_data.sections)) {
        const bodyItems = [];
        const items = [];
        for (const source of list(section.items)) {
            const prescription = prescriptions.get(source.item_key) || null;
            if (source.type === 'circuit') {
                const definition = circuits.get(source.circuit_definition_id);
                if (!definition) return null;
                const item = { ...source, circuit_run_id: createId() };
                const run = await buildRun(item, { sessionId, rootId, definition, prescription });
                runs.push(run);
                instances.push(...placeholderCircuitInstances(run, { sessionId, rootId }));
                bodyItems.push(item);
                items.push({ type: 'circuit', circuit_run_id: run.id });
            } else {
                const definition = definitions.get(source.activity_definition_id);
                if (!definition) return null;
                const item = { ...source, instance_id: createId() };
                instances.push(await buildInstance(item, {
                    sessionId, definition, prescription, tags, groupName: groupNames.get(definition.group_id) || null,
                }));
                bodyItems.push(item);
                items.push({ type: 'activity', activity_instance_id: item.instance_id });
            }
        }
        bodySections.push({ ...section, items: bodyItems });
        sections.push({ ...section, items });
    }
    // Dated plans are resolved by the server; started offline, a session follows its template.
    const { plan_ref: _planRef, ...body } = payload;
    const at = nowIso();
    const sessionData = { ...payload.session_data, sections };
    const session = {
        id: sessionId,
        root_id: rootId,
        name: payload.name,
        description: payload.description || '',
        session_start: payload.session_start,
        session_end: null,
        duration_minutes: payload.duration_minutes ?? null,
        total_duration_seconds: null,
        is_paused: false,
        last_paused_at: null,
        total_paused_seconds: 0,
        template_id: payload.template_id,
        program_day_id: payload.session_data.program_context?.day_id || null,
        program_id: payload.session_data.program_context?.program_id || null,
        program_block_id: payload.session_data.program_context?.block_id || null,
        program_session_plan_id: null,
        completed: false,
        completed_at: null,
        created_at: at,
        updated_at: at,
        attributes: { id: sessionId, type: 'Session', session_start: payload.session_start, completed: false, session_data: sessionData },
        stats: { template: {}, activity_durations: {} },
        activity_instances: instances,
        notes: [],
        session_type: 'normal',
        template_color: payload.session_data.template_color || null,
        session_goals: [],
        completed_goals: [],
        ...(payload.session_data.program_context ? { program_info: payload.session_data.program_context } : {}),
        _pendingSync: true,
    };
    return {
        body: { ...body, id: sessionId, session_data: { ...payload.session_data, sections: bodySections } },
        session, instances, runs, userId,
    };
}

const byId = (records) => new Map(list(records).map((record) => [record.id, record]));

export async function startSessionOffline(outbox, queryClient, { rootId, userId, template, payload }) {
    const cached = (queryKey) => queryClient.getQueryData(queryKey);
    const tagLists = queryClient.getQueriesData({ queryKey: queryKeys.activityTagCatalog(rootId) });
    const built = await buildOfflineSession({
        rootId, userId, template, payload,
        definitions: byId(cached(queryKeys.activities(rootId))),
        circuits: byId([
            ...list(cached(queryKeys.circuits(rootId, true))), ...list(cached(queryKeys.circuits(rootId, false))),
        ]),
        tags: byId(tagLists.flatMap(([, catalog]) => list(catalog?.tags))),
        groupNames: new Map(list(cached(queryKeys.activityGroups(rootId))).map((group) => [group.id, group.name])),
    });
    if (!built) return null;
    const { body, session, instances, runs } = built;
    await outbox.submit({
        scope: session.id,
        kind: SESSION_OP.START,
        method: 'post',
        url: `/${rootId}/sessions`,
        body,
        creates: [session.id, ...instances.map(({ id }) => id), ...runs.map(({ id }) => id)],
        meta: { rootId, sessionId: session.id, userId, session, instances, runs },
    });
    return session;
}
