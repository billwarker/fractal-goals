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
