// The Fractal Goals logo: the Ultimate-goal twelve-point star (GoalIcon's static
// "twelvePointStar") in the brand's red and black. BrandMark renders it in the app and
// scripts/build-brand-assets.mjs writes the favicon and app icons from brandMarkSvg, so
// the two can't drift.

export const BRAND_RED = '#b8311d';
export const BRAND_INK = '#000000';
export const BRAND_TILE = '#121419';

// Each layer is three squares rotated 0°, 30° and 60° about the centre of a 100×100 box.
// Each square paints its fill over the previous one's stroke, which gives the woven look.
export const BRAND_MARK_LAYERS = [
    { inset: 20, size: 60 },
    { inset: 30, size: 40 },
    { inset: 40, size: 20 },
];
export const BRAND_MARK_ROTATIONS = [0, 30, 60];
export const BRAND_MARK_STROKE = 5;

// How far the mark reaches from the centre along x or y. The outer squares' mitred corners
// sit (30 + stroke/2)·√2 out, and with rotations of 0/30/60 the nearest one to an axis is 15° off it.
const markRadius = (strokeWidth) => (30 + strokeWidth / 2) * Math.SQRT2 * Math.cos(Math.PI / 12);

export function brandMarkSquares() {
    return BRAND_MARK_LAYERS.flatMap((layer) => BRAND_MARK_ROTATIONS.map((rotation) => ({
        key: `${layer.size}-${rotation}`,
        x: layer.inset,
        y: layer.inset,
        size: layer.size,
        transform: rotation ? `rotate(${rotation} 50 50)` : undefined,
    })));
}

// The square viewBox that just contains the mark, with `padding` as a fraction of its side.
export function brandMarkViewBox({ strokeWidth = BRAND_MARK_STROKE, padding = 0 } = {}) {
    const radius = markRadius(strokeWidth);
    const half = radius / (1 - 2 * padding);
    const round = (value) => Number(value.toFixed(3));
    return `${round(50 - half)} ${round(50 - half)} ${round(half * 2)} ${round(half * 2)}`;
}

// A standalone SVG document for static assets. `background` fills the whole square
// (app icons must be opaque); without one the mark sits on transparency.
export function brandMarkSvg({
    size = 100,
    strokeWidth = BRAND_MARK_STROKE,
    padding = 0,
    background = null,
} = {}) {
    const viewBox = brandMarkViewBox({ strokeWidth, padding });
    const [minX, minY, side] = viewBox.split(' ');
    const rects = brandMarkSquares().map(({ x, y, size: side_, transform }) => (
        `    <rect x="${x}" y="${y}" width="${side_}" height="${side_}"${transform ? ` transform="${transform}"` : ''}/>`
    ));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">`,
        background ? `  <rect x="${minX}" y="${minY}" width="${side}" height="${side}" fill="${background}"/>` : null,
        `  <g fill="${BRAND_INK}" stroke="${BRAND_RED}" stroke-width="${strokeWidth}" stroke-linejoin="miter">`,
        ...rects,
        '  </g>',
        '</svg>',
        '',
    ].filter((line) => line !== null).join('\n');
}
