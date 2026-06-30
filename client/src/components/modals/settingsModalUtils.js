import { logError } from '../../utils/logger';
export function getAvailableTimezones() {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch (error) {
        logError('Timezone API not supported', error);
        return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
    }
}

export function buildQuotaRows(accountUsage) {
    if (!accountUsage) return [];
    const resources = accountUsage.resources || Object.keys(accountUsage.usage || {});
    const labels = accountUsage.labels || {};
    return resources.map((resource) => {
        const used = accountUsage.usage?.[resource] ?? 0;
        const limit = accountUsage.limits?.[resource] ?? null;
        const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        return {
            resource,
            label: labels[resource] || resource.replace(/_/g, ' '),
            used,
            limit,
            percent,
        };
    });
}

export function toggleQuotaRootId(currentRootIds, rootId) {
    if (currentRootIds.includes(rootId)) {
        return currentRootIds.filter((id) => id !== rootId);
    }
    return [...currentRootIds, rootId];
}
