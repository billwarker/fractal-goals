export function resolveEffectiveDeltaDisplayMode(activityDefinition, progressSettings) {
    const activityMode = activityDefinition?.delta_display_mode;
    if (activityMode === 'percent' || activityMode === 'absolute') return activityMode;
    const rootMode = progressSettings?.delta_display_mode;
    if (rootMode === 'percent' || rootMode === 'absolute') return rootMode;
    return 'percent';
}

export function useEffectiveDeltaDisplayMode(activityDefinition, progressSettings) {
    return resolveEffectiveDeltaDisplayMode(activityDefinition, progressSettings);
}
