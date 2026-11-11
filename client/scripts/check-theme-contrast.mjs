#!/usr/bin/env node
// WCAG contrast gate for the theme tokens in src/design-tokens.css. Both themes are parsed
// (light inherits whatever its block doesn't override), var() chains are resolved, and
// translucent colours are composited over the surface they sit on. Fails on any pair below
// its minimum. Run by `npm run check:contrast` and `./run-tests.sh lint`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIGHT_THEME_CARD, contrastRatio } from '../src/utils/themeColors.js';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(clientRoot, 'src/design-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
    const start = source.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`design-tokens.css has no ${selector} block`);
    const body = source.slice(source.indexOf('{', start) + 1, source.indexOf('\n}', start));
    const tokens = {};
    for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
    return tokens;
}

const darkTokens = block(':root');
const themes = { dark: darkTokens, light: { ...darkTokens, ...block('[data-theme="light"]') } };

function resolve(tokens, value, depth = 0) {
    if (depth > 12) throw new Error(`var() cycle while resolving ${value}`);
    return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, name, fallback) => {
        const next = tokens[name] ?? fallback;
        if (next === undefined) throw new Error(`undefined token ${name}`);
        return resolve(tokens, next, depth + 1);
    });
}

const toHex = (channels) => `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

/** A resolved colour as [r, g, b, alpha] (0–255, alpha 0–1), or null for anything else. */
function parseColor(value) {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (hex) {
        const digits = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
        return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16)).concat(1);
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
    const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i.exec(value);
    if (mix) {
        const [first, second] = [parseColor(mix[1]), parseColor(mix[3])];
        const weight = Number(mix[2]) / 100;
        if (!first || !second || first[3] < 1 || second[3] < 1) return null;
        return first.slice(0, 3).map((channel, index) => channel * weight + second[index] * (1 - weight)).concat(1);
    }
    if (value === 'white') return [255, 255, 255, 1];
    if (value === 'black') return [0, 0, 0, 1];
    return null;
}

function colorOf(theme, token, over = null) {
    const value = resolve(themes[theme], themes[theme][token] ?? token);
    const color = parseColor(value);
    if (!color) throw new Error(`${theme} ${token} is not a plain colour: ${value}`);
    const [r, g, b, alpha] = color;
    if (alpha >= 1 || !over) return toHex([r, g, b]);
    const base = parseColor(colorOf(theme, over));
    return toHex([r, g, b].map((channel, index) => channel * alpha + base[index] * (1 - alpha)));
}

const TEXT_SURFACES = ['--color-bg-app', '--color-bg-card', '--color-bg-card-alt', '--color-bg-elevated', '--color-bg-sidebar', '--color-bg-header', '--color-bg-input'];
const READING_SURFACES = ['--color-bg-card', '--color-bg-elevated', '--color-bg-sidebar', '--color-bg-input'];
const CHROME_SURFACES = ['--color-bg-app', '--color-bg-header', '--color-bg-card-alt'];

const pairs = (themesToCheck, foreground, backgrounds, minimum, why) => themesToCheck.flatMap((theme) => (
    backgrounds.map((background) => ({ theme, foreground, background, minimum, why }))
));
const BOTH = ['dark', 'light'];

const CHECKS = [
    ...pairs(BOTH, '--color-text-primary', TEXT_SURFACES, 7, 'body text'),
    ...pairs(BOTH, '--color-text-secondary', TEXT_SURFACES, 4.5, 'secondary text'),
    ...pairs(BOTH, '--color-text-muted', READING_SURFACES, 4.5, 'muted text on reading surfaces'),
    ...pairs(BOTH, '--color-text-muted', CHROME_SURFACES, 3, 'muted labels on chrome'),
    ...pairs(BOTH, '--color-brand-primary', ['--color-bg-card', '--color-bg-app'], 3, 'primary accents and large links'),
    ...pairs(BOTH, '--color-connection-line', ['--color-bg-app'], 3, 'flow-tree connecting lines'),
    ...pairs(['light'], '--color-border-hover', ['--color-bg-card'], 3, 'hovered and active control edges'),
    ...pairs(BOTH, '--color-focus-ring', ['--color-bg-card', '--color-bg-app'], 3, 'focus ring'),
    // The light theme's filled buttons carry white text (dark ones use their own text tokens).
    ...pairs(['light'], '--color-text-inverse', ['--color-brand-primary', '--color-brand-success', '--color-brand-danger', '--color-accent'], 4.5, 'text on filled buttons'),
    ...pairs(['dark'], '--color-text-inverse', ['--color-brand-danger'], 4.5, 'text on danger buttons'),
    ...pairs(['light'], '--color-brand-primary', ['--color-bg-card', '--color-bg-elevated'], 4.5, 'link text'),
    ...pairs(['light'], '--color-brand-danger', ['--color-bg-card'], 4.5, 'error text'),
    ...pairs(['light'], '--color-brand-success', ['--color-bg-card'], 4.5, 'success text'),
    ...pairs(['light'], '--color-session-active-text', ['--color-session-active-bg'], 4.5, 'active session pill'),
    ...pairs(['light'], '--color-session-paused-text', ['--color-session-paused-bg'], 4.5, 'paused session pill'),
];

const failures = [];
const rows = [];
for (const check of CHECKS) {
    let ratio;
    try {
        const background = colorOf(check.theme, check.background);
        ratio = contrastRatio(colorOf(check.theme, check.foreground, check.background), background);
    } catch (error) {
        failures.push(`${check.theme}: ${check.foreground} on ${check.background}: ${error.message}`);
        continue;
    }
    const passed = ratio >= check.minimum;
    rows.push(`${passed ? 'ok  ' : 'FAIL'} ${check.theme.padEnd(5)} ${ratio.toFixed(2).padStart(5)} ≥ ${check.minimum}  ${check.foreground} on ${check.background} (${check.why})`);
    if (!passed) failures.push(rows.at(-1));
}

if (colorOf('light', '--color-bg-card').toLowerCase() !== LIGHT_THEME_CARD.toLowerCase()) {
    failures.push(`LIGHT_THEME_CARD in src/utils/themeColors.js (${LIGHT_THEME_CARD}) must equal the light --color-bg-card (${colorOf('light', '--color-bg-card')})`);
}

if (process.argv.includes('--verbose') || failures.length) console.log(rows.join('\n'));
if (failures.length) {
    console.error(`\nTheme contrast check failed (${failures.length}):\n${failures.join('\n')}`);
    process.exit(1);
}
console.log(`Theme contrast check passed (${rows.length} pairs across both themes).`);
