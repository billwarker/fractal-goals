// One grammar for typed times and durations: a countdown's length ("30m", "1h30m", "2:30") and a
// start/stop adjustment ("+10m", "-1h30m", "now", "now - 30m").
//
// A duration is groups joined by + or -. A group is unit terms run together ("1h30m", "1h 30m",
// "1.5h") or a clock ("2:30", "1:02:30"). An adjustment starts with a sign (an offset from the
// field's time) or with "now" (an offset from the current time). Letters may be any case.

export const TIME_ADJUSTMENT_HINT = 'Use +10m, -1h30m, now, or now - 30m';
export const DURATION_HINT = 'Use 30m, 1h30m, or 2:30';

const TOKEN = /\s*(now|[+-]|\d+(?:\.\d+)?\s*[hms]|\d+:\d{1,2}(?::\d{1,2})?)\s*/y;
const UNIT_SECONDS = { h: 3600, m: 60, s: 1 };

function tokenize(text) {
    const input = String(text ?? '').toLowerCase();
    const tokens = [];
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < input.length) {
        const match = TOKEN.exec(input);
        if (!match) return null;
        tokens.push(match[1].replace(/\s+/g, ''));
    }
    return tokens;
}

const isSign = (token) => token === '+' || token === '-';
const isClock = (token) => token?.includes(':');
const isUnitTerm = (token) => /^\d/.test(token ?? '') && !isClock(token);

function clockSeconds(token) {
    const parts = token.split(':').map(Number);
    // The first part is unbounded ("90:00" is 90 minutes); the rest are minutes or seconds of 60.
    if (parts.slice(1).some((part) => part >= 60)) return null;
    return parts.reduce((total, part) => (total * 60) + part, 0);
}

/**
 * Parse an expression into `{ base, seconds, signed }`: `base` is 'now' or null, `seconds` the
 * (whole) offset, `signed` whether it began with + or -. Null when it doesn't follow the grammar.
 */
export function parseTimeExpression(text) {
    const tokens = tokenize(text);
    if (!tokens || tokens.length === 0) return null;
    let index = 0;
    const base = tokens[0] === 'now' ? 'now' : null;
    if (base) index += 1;
    const signed = !base && isSign(tokens[0]);
    let seconds = 0;
    let groups = 0;
    while (index < tokens.length) {
        let sign = 1;
        if (isSign(tokens[index])) {
            sign = tokens[index] === '-' ? -1 : 1;
            index += 1;
        } else if (base || groups > 0) {
            return null; // groups after the first, and anything after "now", need a sign
        }
        let groupSeconds = null;
        if (isClock(tokens[index])) {
            groupSeconds = clockSeconds(tokens[index]);
            index += 1;
        } else {
            // Unit terms run together, largest unit first, each unit once: "1h30m", not "30m1h".
            let lastUnit = Infinity;
            while (isUnitTerm(tokens[index])) {
                const unitSeconds = UNIT_SECONDS[tokens[index].slice(-1)];
                if (unitSeconds >= lastUnit) return null;
                lastUnit = unitSeconds;
                groupSeconds = (groupSeconds ?? 0) + (Number(tokens[index].slice(0, -1)) * unitSeconds);
                index += 1;
            }
        }
        if (groupSeconds == null || !Number.isFinite(groupSeconds)) return null;
        seconds += sign * groupSeconds;
        groups += 1;
    }
    return { base, seconds: Math.round(seconds), signed };
}

/** A countdown's length in seconds ("30m", "1h30m", "2:30"), or null unless it's a positive duration. */
export function parseDurationExpression(text) {
    const parsed = parseTimeExpression(text);
    if (!parsed || parsed.base || parsed.signed || parsed.seconds <= 0) return null;
    return parsed.seconds;
}

/**
 * The ISO time an adjustment names: "now…" counts from `nowMs`; a signed offset ("+10m") counts
 * from `baseIso`, the field's current time. Throws an Error saying what to type otherwise.
 */
export function resolveTimeExpression(text, { baseIso = null, nowMs = Date.now() } = {}) {
    const parsed = parseTimeExpression(text);
    if (!parsed || (!parsed.base && !parsed.signed)) throw new Error(TIME_ADJUSTMENT_HINT);
    const fromMs = parsed.base === 'now' ? nowMs : new Date(baseIso ?? NaN).getTime();
    if (!Number.isFinite(fromMs)) throw new Error('No time set yet. Use now or now - 30m');
    return new Date(fromMs + (parsed.seconds * 1000)).toISOString();
}
