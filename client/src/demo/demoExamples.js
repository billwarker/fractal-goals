// The live demo's published examples (the manifest from /api/public/landing-examples):
// each one is a snapshot fractal with what the landing draws and where the tour goes.

// Drawn when an example's root level has no icon of its own.
const FALLBACK_ICON = { shape: 'twelvePointStar', color: '#4f9cf9', secondaryColor: '#102235', isSmart: false };

export function sortDemoExamples(payload) {
    return (payload?.examples || [])
        .filter((example) => example?.root_id)
        .slice()
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
}

export function demoIconProps(icon) {
    return {
        shape: icon?.shape || FALLBACK_ICON.shape,
        color: icon?.color || FALLBACK_ICON.color,
        secondaryColor: icon?.secondary_color || FALLBACK_ICON.secondaryColor,
        isSmart: Boolean(icon?.smart),
    };
}

export function demoRootName(example) {
    return example?.root_name || example?.label || '';
}
