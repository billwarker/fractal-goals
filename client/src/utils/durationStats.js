export function formatAverageDuration(seconds, emptyValue = null) {
    if (seconds == null || Number.isNaN(Number(seconds)) || Number(seconds) <= 0) {
        return emptyValue;
    }

    const totalSeconds = Math.round(Number(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return '<1m';
}

export function getAverageDurationStat(stats) {
    if (!stats || Number(stats.sample_count || stats.session_count || 0) <= 1) {
        return null;
    }

    const seconds = stats.average_duration_seconds;
    const label = formatAverageDuration(seconds);
    if (!label) return null;

    return {
        seconds,
        label,
        sampleCount: Number(stats.sample_count || stats.session_count || 0),
    };
}

export function getTemplateSortTimestamp(template) {
    return template?.stats?.last_used_at
        || template?.updated_at
        || template?.created_at
        || '';
}

export function formatLastUsed(value) {
    if (!value) return null;

    const usedAt = new Date(value);
    if (Number.isNaN(usedAt.getTime())) return null;

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfUsedDay = new Date(usedAt.getFullYear(), usedAt.getMonth(), usedAt.getDate());
    const diffDays = Math.round((startOfToday - startOfUsedDay) / 86400000);

    if (diffDays === 0) return 'Last used today';
    if (diffDays === 1) return 'Last used yesterday';
    if (diffDays > 1 && diffDays < 7) return `Last used ${diffDays} days ago`;

    return `Last used ${usedAt.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: usedAt.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })}`;
}
