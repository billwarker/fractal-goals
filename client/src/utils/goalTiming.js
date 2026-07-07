export function getAgeLabel(createdAt, referenceDate = new Date()) {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    const diffMs = referenceDate - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return `${diffDays}d`;
    if (diffDays < 30) return `${(diffDays / 7).toFixed(1)}w`;
    if (diffDays < 365) return `${(diffDays / 30).toFixed(1)}m`;
    return `${(diffDays / 365).toFixed(1)}y`;
}
