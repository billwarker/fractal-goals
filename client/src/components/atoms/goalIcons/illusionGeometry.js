/**
 * Geometry for the impossible-figure goal icons (see illusionShapes.js).
 * Everything works in the shared 100x100 icon viewBox and returns plain path strings.
 */

const r1 = (n) => Math.round(n * 10) / 10;
export const fmt = (p) => `${r1(p[0])} ${r1(p[1])}`;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
export const unit = (a) => mul(a, 1 / len(a));
export const dist = (a, b) => len(sub(a, b));
export const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

export const pathOf = (pts) => `M${pts.map(fmt).join(' L')} Z`;
export const polyline = (pts, closed) => `M${pts.map(fmt).join(' L')}${closed ? ' Z' : ''}`;
export const circlePath = (c, r) => `M${r1(c[0] - r)} ${r1(c[1])} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;

/* ---------- Straight sides, offset inward ---------- */

const sideLine = (a, b, inside) => {
    const d = unit(sub(b, a));
    let n = [-d[1], d[0]];
    if (dot2(sub(inside, a), n) < 0) n = mul(n, -1);
    return { p: a, d, n };
};
const offsetLine = (line, o) => ({ ...line, p: add(line.p, mul(line.n, o)) });
const meet = (a, b) => {
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    const w = sub(b.p, a.p);
    return add(a.p, mul(a.d, (w[0] * b.d[1] - w[1] * b.d[0]) / den));
};

export const polygonSides = (corners) => {
    const centroid = mul(corners.reduce(add, [0, 0]), 1 / corners.length);
    return corners.map((c, k) => sideLine(c, corners[(k + 1) % corners.length], centroid));
};

/**
 * Penrose ring: a closed polygon split into n chevron faces, each running along the outer band
 * of one side and the inner band of the previous one — the construction behind the impossible
 * triangle. Returns piece paths, the hole outline, and each piece's spine (the centre of its
 * inner band, turning at the corner into the centre of its outer band). On every side two
 * neighbouring spines run the same way, so flow along them reads as one endless current.
 */
export const penroseRing = (sides, w) => {
    const n = sides.length;
    const m = (i) => ((i % n) + n) % n;
    const L = (j, k) => offsetLine(sides[m(k)], j * w);
    const I = (j1, k1, j2, k2) => meet(L(j1, k1), L(j2, k2));

    const pieces = Array.from({ length: n }, (_, k) => pathOf([
        I(0, k, 0, k + 1),
        I(1, k, 0, k + 1),
        I(1, k, 2, k - 1),
        I(2, k - 1, 2, k - 2),
        I(1, k - 1, 2, k - 2),
        I(1, k - 1, 0, k),
    ]));
    const hole = pathOf(Array.from({ length: n }, (_, k) => I(2, k - 1, 2, k)));
    const spines = Array.from({ length: n }, (_, k) => [
        I(1.5, k - 1, 2, k - 2),
        I(1.5, k - 1, 0.5, k),
        I(0.5, k, 0, k + 1),
    ]);
    return { pieces, hole, spines };
};

/* ---------- Orthographic camera for the 3D figures ---------- */

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

// Looks down at the origin from `yaw` degrees round the vertical axis and `pitch` degrees above it.
// project() returns [screen x, screen y (down), depth toward the viewer].
export const camera = (yawDeg, pitchDeg) => {
    const y = (yawDeg * Math.PI) / 180;
    const p = (pitchDeg * Math.PI) / 180;
    const v = [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
    const r = norm3(cross(v, [0, 0, 1]));
    const u = cross(r, v);
    return { v, project: (q) => [dot3(q, r), -dot3(q, u), dot3(q, v)] };
};

// Unit-cube faces: outward normal and corner selectors (0 = box min, 1 = box max on each axis).
export const BOX_FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

// Where segment a→b crosses segment c→d (interiors only), or null.
export const segHit = (a, b, c, d) => {
    const r = sub(b, a);
    const q = sub(d, c);
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
    const v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 0.02 && t < 0.98 && v > 0.02 && v < 0.98 ? add(a, mul(r, t)) : null;
};

/* ---------- Scene nodes (colour tokens: 'p' primary, 's' secondary) ---------- */

export const SW = 4;
export const face = (d, fill = 's') => ({ d, fill, stroke: 'p', sw: SW });
export const fillOnly = (d, fill) => ({ d, fill, stroke: 'none' });
export const strokeOnly = (d, sw = SW) => ({ d, fill: 'none', stroke: 'p', sw });
export const group = (children, extra = {}) => ({ g: children, ...extra });
