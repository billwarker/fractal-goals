export function buildInstanceMap(activityInstances = []) {
    const map = new Map();
    for (const instance of activityInstances) {
        map.set(instance.id, instance);
    }
    return map;
}

export function buildDefinitionMap(activities = []) {
    const map = new Map();
    for (const definition of activities) {
        map.set(definition.id, definition);
    }
    return map;
}

export function buildPositionMap(activityIds = []) {
    const map = new Map();
    activityIds.forEach((id, index) => {
        map.set(id, index);
    });
    return map;
}

export function buildSessionPositionMap(sections = []) {
    const map = new Map();
    let index = 0;

    sections.forEach((section) => {
        (section?.activity_ids || []).forEach((id) => {
            map.set(id, index);
            index += 1;
        });
    });

    return map;
}

function extractDefinitionId(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const direct = item.activity_id
        || item.activity_definition_id
        || item.activityId
        || item.activityDefinitionId
        || item.definition_id
        || item.id;
    if (direct) return direct;
    if (item.activity && typeof item.activity === 'object') {
        return item.activity.id
            || item.activity.activity_id
            || item.activity.activity_definition_id
            || null;
    }
    return null;
}

/**
 * Resolve persisted section membership to canonical activity-instance IDs.
 *
 * Older session payloads can carry definition IDs or embedded exercise objects,
 * while the current detail surface renders instances. Keeping this adapter in a
 * shared utility ensures live and read-only session surfaces recover identically.
 */
export function normalizeSectionActivityIds(data, instances) {
    if (!data || typeof data !== 'object') return data;
    const sections = Array.isArray(data.sections) ? data.sections : [];
    if (sections.length === 0) return data;

    const idsByDefinition = new Map();
    const allInstanceIds = [];
    const allInstanceIdSet = new Set();

    (instances || []).forEach((instance) => {
        const definitionId = instance?.activity_definition_id;
        const instanceId = instance?.id;
        if (!definitionId || !instanceId) return;
        const key = String(definitionId);
        if (!idsByDefinition.has(key)) idsByDefinition.set(key, []);
        idsByDefinition.get(key).push(instanceId);
        allInstanceIds.push(instanceId);
        allInstanceIdSet.add(instanceId);
    });

    const used = new Set();
    const claimDefinitionInstance = (definitionId, sectionIds) => {
        if (!definitionId) return null;
        const candidates = idsByDefinition.get(String(definitionId)) || [];
        return candidates.find((id) => !used.has(id) && !sectionIds.has(id)) || null;
    };

    const normalizedSections = sections.map((section) => {
        if (!section || typeof section !== 'object') return section;

        const rawActivityIds = Array.isArray(section.activity_ids) ? section.activity_ids : [];
        const activityIds = rawActivityIds.filter((id) => allInstanceIdSet.has(id) && !used.has(id));
        const sectionIds = new Set(activityIds);

        // Some legacy/template-derived sections stored activity definition IDs
        // in activity_ids. Preserve their section ordering when resolving them.
        rawActivityIds.forEach((id) => {
            if (allInstanceIdSet.has(id)) return;
            const instanceId = claimDefinitionInstance(id, sectionIds);
            if (instanceId) {
                activityIds.push(instanceId);
                sectionIds.add(instanceId);
            }
        });

        if (activityIds.length === 0) {
            const rawItems = section.exercises || section.activities || [];

            for (const item of rawItems) {
                if (!item || typeof item !== 'object') continue;
                const instanceId = item.instance_id;
                if (instanceId && allInstanceIdSet.has(instanceId) && !used.has(instanceId) && !sectionIds.has(instanceId)) {
                    activityIds.push(instanceId);
                    sectionIds.add(instanceId);
                }
            }

            if (activityIds.length === 0) {
                for (const item of rawItems) {
                    const instanceId = claimDefinitionInstance(extractDefinitionId(item), sectionIds);
                    if (instanceId) {
                        activityIds.push(instanceId);
                        sectionIds.add(instanceId);
                    }
                }
            }
        }

        activityIds.forEach((id) => used.add(id));
        return { ...section, activity_ids: activityIds };
    });

    if (normalizedSections.length === 1 && normalizedSections[0]
        && (!normalizedSections[0].activity_ids || normalizedSections[0].activity_ids.length === 0)) {
        normalizedSections[0] = { ...normalizedSections[0], activity_ids: allInstanceIds };
    }

    return { ...data, sections: normalizedSections };
}
