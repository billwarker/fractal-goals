const DEFAULT_SCATTER_POINT_PROFILE = {
    baseRadius: 8,
    radiusStep: 3,
    hoverOffset: 4,
    maxRadius: 24,
};

function coordinateKey(point) {
    return `${Number(point.x)}:${Number(point.y)}`;
}

export function withScatterPointDensity(points, profile = {}) {
    const resolvedProfile = { ...DEFAULT_SCATTER_POINT_PROFILE, ...profile };
    const countsByCoordinate = new Map();

    points.forEach((point) => {
        const key = coordinateKey(point);
        countsByCoordinate.set(key, (countsByCoordinate.get(key) || 0) + 1);
    });

    return points.map((point) => {
        const densityCount = countsByCoordinate.get(coordinateKey(point)) || 1;
        const pointRadius = Math.min(
            resolvedProfile.maxRadius,
            resolvedProfile.baseRadius + ((densityCount - 1) * resolvedProfile.radiusStep)
        );

        return {
            ...point,
            densityCount,
            pointRadius,
            pointHoverRadius: pointRadius + resolvedProfile.hoverOffset,
        };
    });
}

