/**
 * Theme adaptation for user-chosen colours (goal levels, completion colour).
 *
 * Those colours are stored once and were picked against the dark theme. In the light theme a
 * colour that is too pale to read against a light surface is darkened in OKLCH (same hue,
 * chroma kept where the sRGB gamut allows) until it reaches `minContrast`; colours that already
 * read are returned unchanged. The dark theme always returns the stored colour.
 */

// Keep in step with --color-bg-card in design-tokens.css' light block;
// scripts/check-theme-contrast.mjs fails when they drift apart.
export const LIGHT_THEME_CARD = '#fafaf9';
// Goal colours mark icons, dots, lines and badges, so they meet the 3:1 non-text minimum
// (WCAG 1.4.11). Text never wears them unless it is large or set beside an icon.
export const LIGHT_THEME_MIN_CONTRAST = 3;

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i;

export function parseHex(hex) {
    const match = HEX_PATTERN.exec(String(hex || '').trim());
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].split('').map((digit) => digit + digit).join('') : match[1];
    return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
}

const toHex = (rgb) => `#${rgb.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);

export function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (alpha ignored). */
export function contrastRatio(foreground, background) {
    const first = parseHex(foreground);
    const second = parseHex(background);
    if (!first || !second) return null;
    const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

function toOklab(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

function fromOklab([lightness, a, b]) {
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map(fromLinear);
}

const inGamut = (rgb) => rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001);

// Highest chroma (scale of a/b) at this lightness that stays inside sRGB.
function gamutMapped(lightness, a, b) {
    let low = 0;
    let high = 1;
    if (inGamut(fromOklab([lightness, a, b]))) return fromOklab([lightness, a, b]);
    for (let step = 0; step < 20; step += 1) {
        const scale = (low + high) / 2;
        if (inGamut(fromOklab([lightness, a * scale, b * scale]))) low = scale;
        else high = scale;
    }
    return fromOklab([lightness, a * low, b * low]).map((channel) => Math.min(1, Math.max(0, channel)));
}

const YELLOW_HUES = [70, 120].map((degrees) => (degrees * Math.PI) / 180);
const GOLD_HUE = (75 * Math.PI) / 180;

// Hue rotation (radians) toward gold for a yellow being darkened by `progress` (0–1).
function yellowHueShift(hue, progress) {
    if (hue < YELLOW_HUES[0] || hue > YELLOW_HUES[1]) return 0;
    return (GOLD_HUE - hue) * Math.min(1, progress);
}

/** `hex` darkened along OKLCH lightness until it reaches `minContrast` against `against`. */
export function ensureContrast(hex, against = LIGHT_THEME_CARD, minContrast = LIGHT_THEME_MIN_CONTRAST) {
    const rgb = parseHex(hex);
    const background = parseHex(against);
    if (!rgb || !background) return hex;
    if (contrastRatio(hex, against) >= minContrast) return hex;
    const [lightness, a, b] = toOklab(rgb);
    const chroma = Math.hypot(a, b);
    const hue = Math.atan2(b, a);
    for (let next = lightness - 0.01; next > 0.05; next -= 0.01) {
        // Darkened yellow turns olive; easing it toward gold keeps it reading as yellow.
        const shifted = hue + yellowHueShift(hue, (lightness - next) / 0.3);
        const candidate = toHex(gamutMapped(next, chroma * Math.cos(shifted), chroma * Math.sin(shifted)));
        if (contrastRatio(candidate, against) >= minContrast) return candidate;
    }
    return '#000000';
}

const cache = new Map();

/** The colour to show for a stored user colour in the given theme. */
export function adaptColorForTheme(hex, theme) {
    if (theme !== 'light' || !parseHex(hex)) return hex;
    const key = String(hex).toLowerCase();
    if (!cache.has(key)) cache.set(key, ensureContrast(hex));
    return cache.get(key);
}
