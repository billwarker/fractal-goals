import {
    BOX_FACES, SW, add, camera, circlePath, dist, dot2, dot3, face, fillOnly, fmt, group, mul,
    pathOf, penroseRing, polygonSides, polyline, segHit, strokeOnly, sub, unit,
} from './illusionGeometry';

/**
 * Impossible-figure goal icon shapes, described as data so GoalIcon (static) and
 * AnimatedGoalIcon (looping) render them identically through IllusionIconBody.
 *
 *   silhouette  the basic (non-SMART) solid shape: fill paths, or stroked centrelines { d, sw }
 *   nodes       the SMART scene: paths ({ d, fill, stroke, sw, ... }) and groups ({ g, clip })
 *               coloured with tokens 'p' (primary) and 's' (secondary)
 *   clips       clip paths referenced by groups
 *
 * Motion is SMIL (`anims` on a node). Without animation each node shows its first value,
 * which is the static SMART icon.
 */

// Impossible cube — Escher's frame: one back edge crosses in front where it can't. Lines run
// round every bar in one unbroken circuit.
const impossibleCube = () => {
    const cam = camera(30, 24);
    const verts = [];
    [0, 1].forEach((x) => [0, 1].forEach((y) => [0, 1].forEach((z) => verts.push([x, y, z]))));
    const proj = verts.map(cam.project);
    const xs = proj.map((q) => q[0]);
    const ys = proj.map((q) => q[1]);
    const sc = 80 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const scr = proj.map((q) => [50 + (q[0] - (Math.max(...xs) + Math.min(...xs)) / 2) * sc, 50 + (q[1] - (Math.max(...ys) + Math.min(...ys)) / 2) * sc]);
    const edges = [];
    verts.forEach((a, i) => verts.forEach((b, j) => {
        if (j > i && a.filter((_, k) => a[k] !== b[k]).length === 1) edges.push([i, j]);
    }));
    const depth = ([i, j]) => proj[i][2] + proj[j][2];
    const sorted = [...edges].sort((e, f) => depth(e) - depth(f));
    // The highest crossing is flipped, so a back edge passes in front of a front one.
    const crossings = [];
    sorted.forEach((e, ei) => sorted.slice(ei + 1).forEach((f) => {
        const x = segHit(scr[e[0]], scr[e[1]], scr[f[0]], scr[f[1]]);
        if (x) crossings.push({ back: e, x });
    }));
    const flipped = crossings.sort((m, n) => m.x[1] - n.x[1])[0];

    // Drawn in layers: primary bars and joints, then mitred cores with runners, then patches
    // where bars cross.
    const outerW = 12;
    const coreW = 6;
    const runW = 2.2;
    // Runners follow a loop through all eight corners (a Gray-code Hamiltonian cycle); each bar's
    // dash phase continues from the last so the current flows unbroken round the cube.
    const cycle = [0, 1, 3, 2, 6, 7, 5, 4];
    const along = new Map();
    let run = 0;
    cycle.forEach((v, i) => {
        const w = cycle[(i + 1) % cycle.length];
        along.set([v, w].sort((m, n) => m - n).join('-'), { from: v, to: w, start: run });
        run += dist(scr[v], scr[w]);
    });
    const period = run / Math.round(run / 40);
    const dash = `${(period * 0.68).toFixed(2)} ${(period * 0.32).toFixed(2)}`;
    const runDur = 1.6;

    // Corner joints from the bar outlines: an inside angle closes where the facing edges meet,
    // an outside angle is cut flat across the bar ends.
    const meet = (p1, d1, p2, d2) => {
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        return add(p1, mul(d1, ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den));
    };
    const armsAt = (v) => edges.filter((e) => e.includes(v)).map((e) => unit(sub(scr[e[0] === v ? e[1] : e[0]], scr[v])));
    const joints = verts.map((_, v) => {
        const V = scr[v];
        const arms = armsAt(v).sort((m, n) => Math.atan2(m[1], m[0]) - Math.atan2(n[1], n[0]));
        return pathOf(arms.flatMap((u, i) => {
            const next = arms[(i + 1) % arms.length];
            let gap = Math.atan2(next[1], next[0]) - Math.atan2(u[1], u[0]);
            if (gap <= 0) gap += 2 * Math.PI;
            const toNext = add(V, mul([-u[1], u[0]], outerW / 2));
            const fromPrev = add(V, mul([next[1], -next[0]], outerW / 2));
            return gap < Math.PI - 1e-6 ? [meet(toNext, u, fromPrev, next)] : [toNext, fromPrev];
        }));
    });

    // Mitred cores: each core ends on the bisector between its bar and every other bar at that
    // corner, inset by a thin seam, so neighbouring cores never touch.
    const seam = 1.6;
    const clipHalf = (poly, keep) => poly.flatMap((q, i) => {
        const r = poly[(i + 1) % poly.length];
        const kq = keep(q);
        const kr = keep(r);
        const out = kq >= 0 ? [q] : [];
        if ((kq >= 0) !== (kr >= 0)) out.push(add(q, mul(sub(r, q), kq / (kq - kr))));
        return out;
    });
    const mitreTo = (v, u) => armsAt(v).filter((o) => Math.abs(o[0] - u[0]) + Math.abs(o[1] - u[1]) > 1e-6)
        .map((o) => ({ V: scr[v], n: sub(u, o) }));
    const inner = (e) => {
        const leg = along.get(`${e[0]}-${e[1]}`) || { from: e[0], to: e[1], start: 0 };
        const A = scr[leg.from];
        const B = scr[leg.to];
        const u = unit(sub(B, A));
        const nrm = mul([-u[1], u[0]], coreW / 2);
        const cuts = [...mitreTo(leg.from, u), ...mitreTo(leg.to, mul(u, -1))];
        let core = [add(A, nrm), add(B, nrm), sub(B, nrm), sub(A, nrm)];
        cuts.forEach(({ V, n }) => { core = clipHalf(core, (q) => dot2(sub(q, V), n) - seam); });
        // Runner: the centreline span that clears every mitre by its own half-width too.
        let t0 = 0;
        let t1 = dist(A, B);
        cuts.forEach(({ V, n }) => {
            const k = dot2(u, n);
            if (Math.abs(k) < 1e-9) return;
            const t = -(dot2(sub(A, V), n) - seam - runW) / k;
            if (k > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        });
        const off = -(leg.start + t0);
        return [
            fillOnly(pathOf(core), 's'),
            {
                d: polyline([add(A, mul(u, t0)), add(A, mul(u, t1))]), fill: 'none', stroke: 'p', sw: runW, cap: 'butt', dash,
                anims: [{ attr: 'stroke-dashoffset', values: [off.toFixed(2), (off + period).toFixed(2)], dur: runDur }],
            },
        ];
    };

    // Where two bars cross, redraw a short stretch of the one on top — the nearer one, except at
    // the impossible crossing, where the back bar wins.
    const clips = {};
    const patches = [];
    sorted.forEach((e, ei) => sorted.slice(ei + 1).forEach((f) => {
        const x = segHit(scr[e[0]], scr[e[1]], scr[f[0]], scr[f[1]]);
        if (!x) return;
        const isFlip = flipped && flipped.back === e && Math.abs(flipped.x[0] - x[0]) < 1e-6;
        const top = isFlip ? e : f;
        const under = isFlip ? f : e;
        const u = unit(sub(scr[top[1]], scr[top[0]]));
        const w = unit(sub(scr[under[1]], scr[under[0]]));
        const half = outerW / (2 * Math.abs(u[0] * w[1] - u[1] * w[0])) + 2.5;
        const nrm = [-u[1], u[0]];
        const corner = (su, sn) => add(add(x, mul(u, su * half)), mul(nrm, sn * outerW));
        const id = `x${patches.length}`;
        clips[id] = pathOf([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
        patches.push(group([
            { d: polyline([sub(x, mul(u, half)), add(x, mul(u, half))]), fill: 'none', stroke: 'p', sw: outerW, cap: 'butt' },
            ...inner(top),
        ], { clip: id }));
    }));

    const bars = sorted.map(([i, j]) => polyline([scr[i], scr[j]]));
    return {
        silhouette: [...joints, ...bars.map((d) => ({ d, sw: outerW }))],
        clips,
        nodes: [
            ...joints.map((d) => fillOnly(d, 'p')),
            ...bars.map((d) => ({ d, fill: 'none', stroke: 'p', sw: outerW, cap: 'butt' })),
            ...sorted.flatMap(inner),
            ...patches,
        ],
    };
};

// Impossible ring — a twisted band whose strands wind into the centre like a vortex. The strands
// steepen toward both edges, run past them and are clipped to the ring, and nothing outlines the
// rim or the bands, so every band runs out to the edge at full width.
const impossibleRing = () => {
    const R = 46;
    const r = 15;
    const bands = 3;
    const sweep = 200;
    const step = 360 / bands;
    // Each secondary band spans this share of its slot; the primary ring shows through the rest.
    const bandShare = 0.36;
    // Turn (0–1) at radial position u (0 rim → 1 hole). Slope is 1 − bend at both ends, so the
    // strands cross the edges more steeply; beyond the edges they continue in a straight line.
    const bend = 0.6;
    const turn = (u) => {
        if (u < 0) return u * (1 - bend);
        if (u > 1) return 1 + (u - 1) * (1 - bend);
        return u - (bend / (2 * Math.PI)) * Math.sin(2 * Math.PI * u);
    };
    const spiral = (startDeg) => Array.from({ length: 49 }, (_, i) => {
        const u = -0.25 + (1.5 * i) / 48;
        const a = ((startDeg + sweep * turn(u)) * Math.PI) / 180;
        const rad = R - (R - r) * u;
        return [50 + rad * Math.cos(a), 50 + rad * Math.sin(a)];
    });
    const faces = Array.from({ length: bands }, (_, k) => pathOf([
        ...spiral(k * step),
        ...spiral((k + bandShare) * step).reverse(),
    ]));
    const annulus = `${circlePath([50, 50], R)} ${circlePath([50, 50], r)}`;
    return {
        silhouette: [annulus],
        clips: { ring: annulus },
        nodes: [
            fillOnly(annulus, 'p'),
            group([
                // Plain fills, no edge strokes: a stroke along a band's edge would leave a primary
                // sliver between the secondary band and the rim.
                group(faces.map((d) => fillOnly(d, 's')), {
                    anims: [{ attr: 'transform', type: 'rotate', values: ['0 50 50', '360 50 50'], dur: 9 }],
                }),
            ], { clip: 'ring' }),
        ],
    };
};

// Cube star — an isometric jack turning about its vertical axis, like a weathervane. Faces morph
// between projections sampled every 7.5°; each arm swaps between a copy painted behind the hub
// and one painted in front at the exact angle it crosses, and faces appear and vanish edge-on.
// The jack repeats every quarter turn, so the loop covers 90° with the arm slots handing over.
const cubeStar = () => {
    const a = 0.5;
    const L = 3.4;
    const pitch = 26;
    const baseYaw = 45;
    const quarterDur = 3.2;
    const N = 12;
    const yaws = Array.from({ length: N + 1 }, (_, i) => baseYaw + (90 * i) / N);
    const arm = (axis, dir) => {
        const lo = [-a, -a, -a];
        const hi = [a, a, a];
        if (dir > 0) { lo[axis] = a; hi[axis] = L; } else { lo[axis] = -L; hi[axis] = -a; }
        return [lo, hi];
    };
    const hub = [[-a, -a, -a], [a, a, a]];
    const up = arm(2, 1);
    const down = arm(2, -1);
    const slots = [arm(0, 1), arm(1, 1), arm(0, -1), arm(1, -1)];
    const allBoxes = [hub, up, down, ...slots];
    const corner = (bx, c) => [0, 1, 2].map((i) => (c[i] ? bx[1][i] : bx[0][i]));

    // One scale and centre for every sampled angle.
    const pts = yaws.flatMap((y) => {
        const cam = camera(y, pitch);
        return allBoxes.flatMap((bx) => BOX_FACES[0].c.concat(BOX_FACES[1].c).map((c) => cam.project(corner(bx, c))));
    });
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const sc = 92 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const toScreen = (q) => [50 + (q[0] - cx) * sc, 50 + (q[1] - cy) * sc];
    const quad = (bx, f, yaw) => {
        const cam = camera(yaw, pitch);
        return pathOf(f.c.map((c) => toScreen(cam.project(corner(bx, c)))));
    };

    // Discrete timeline of a horizontal direction φ facing the viewer (cos(yaw − φ) > 0), with
    // switch points at the exact crossing angles.
    const facingTimeline = (phiDeg) => {
        const facing = (y) => Math.cos(((y - phiDeg) * Math.PI) / 180) > 1e-9;
        const keyTimes = [0];
        [-270, -90, 90, 270].forEach((d) => {
            for (let turn = -2; turn <= 2; turn += 1) {
                const t = (phiDeg + d + turn * 360 - baseYaw) / 90;
                if (t > 1e-6 && t < 1 - 1e-6) keyTimes.push(t);
            }
        });
        keyTimes.sort((m, n) => m - n);
        return {
            keyTimes: keyTimes.map((t) => Number(t.toFixed(4))),
            values: keyTimes.map((t) => (facing(baseYaw + 90 * t + 0.01) ? 1 : 0)),
        };
    };
    const valueAt = (tl, t) => tl.values.reduce((v, x, i) => (tl.keyTimes[i] <= t ? x : v), tl.values[0]);
    // Visible only while both the face and the arm's side (front or back) are showing.
    const both = (sideTl) => (faceTl) => {
        if (!faceTl) return sideTl;
        const times = [...new Set([...faceTl.keyTimes, ...sideTl.keyTimes])].sort((m, n) => m - n);
        return { keyTimes: times, values: times.map((t) => valueAt(faceTl, t) * valueAt(sideTl, t)) };
    };
    const armFront = (k) => facingTimeline(k * 90);
    const behind = (tl) => ({ keyTimes: tl.keyTimes, values: tl.values.map((v) => 1 - v) });

    const faceNodes = (bx, side) => BOX_FACES.filter((f) => f.n[2] !== -1).map((f) => {
        const values = yaws.map((y) => quad(bx, f, y));
        const anims = [{ attr: 'd', values, dur: quarterDur }];
        let tl = f.n[2] === 1 ? null : facingTimeline((Math.atan2(f.n[1], f.n[0]) * 180) / Math.PI);
        if (side) tl = side(tl);
        if (tl) anims.push({ attr: 'opacity', values: tl.values, keyTimes: tl.keyTimes, calcMode: 'discrete', dur: quarterDur });
        return { ...face(values[0], f.n[2] === 1 ? 'p' : 's'), anims };
    });

    const cam0 = camera(baseYaw, pitch);
    return {
        silhouette: allBoxes.flatMap((bx) => BOX_FACES.filter((f) => dot3(f.n, cam0.v) > 1e-6).map((f) => quad(bx, f, baseYaw))),
        nodes: [
            ...slots.flatMap((bx, k) => faceNodes(bx, both(behind(armFront(k))))),
            ...faceNodes(down),
            ...faceNodes(hub),
            ...faceNodes(up),
            ...slots.flatMap((bx, k) => faceNodes(bx, both(armFront(k)))),
        ],
    };
};

// Penrose tribar — the bevelled impossible triangle, point up. A long line runs along each beam's
// spine and round its impossible corner, so three lines chase each other round it forever.
const penroseTribar = () => {
    const corners = [[50, 7.6], [97, 89], [3, 89]];
    const ring = penroseRing(polygonSides(corners), 9.5);
    const cut = 9;
    const outer = pathOf(corners.flatMap((c, k) => [
        add(c, mul(unit(sub(corners[(k + 2) % 3], c)), cut)),
        add(c, mul(unit(sub(corners[(k + 1) % 3], c)), cut)),
    ]));
    const runners = ring.spines.map((pts, k) => group([{
        d: `M${pts.map(fmt).join(' L')}`, fill: 'none', stroke: 'p', sw: 2.4, join: 'miter', cap: 'butt',
        pathLength: 100, dash: '46 54',
        anims: [{ attr: 'stroke-dashoffset', values: ['0', '-100'], dur: 2.6 }],
    }], { clip: `piece${k}` }));
    return {
        silhouette: [`${outer} ${ring.hole}`],
        clips: { bevel: outer, ...Object.fromEntries(ring.pieces.map((d, k) => [`piece${k}`, d])) },
        nodes: [
            group([
                ...ring.pieces.map((d) => fillOnly(d, 's')),
                ...runners,
                ...ring.pieces.map((d) => strokeOnly(d, 3)),
            ], { clip: 'bevel' }),
            { ...strokeOnly(outer), join: 'round' },
        ],
    };
};

const BUILDERS = {
    'impossible-ring': impossibleRing,
    'cube-star': cubeStar,
    'penrose-tribar': penroseTribar,
    'impossible-cube': impossibleCube,
};

export const ILLUSION_SHAPE_OPTIONS = [
    { label: 'Impossible Ring', value: 'impossible-ring' },
    { label: 'Cube Star', value: 'cube-star' },
    { label: 'Penrose Tribar', value: 'penrose-tribar' },
    { label: 'Impossible Cube', value: 'impossible-cube' },
];

// Geometry is built once per shape and shared by every icon instance.
const cache = new Map();
export const getIllusionShape = (shape) => {
    const key = String(shape || '').toLowerCase();
    if (!BUILDERS[key]) return null;
    if (!cache.has(key)) cache.set(key, BUILDERS[key]());
    return cache.get(key);
};
