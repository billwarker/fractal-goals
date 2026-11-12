// @vitest-environment node
import {
    DARK_THEME_CARD,
    LIGHT_THEME_CANVAS,
    LIGHT_THEME_CARD,
    LIGHT_THEME_MIN_CONTRAST,
    adaptColorForTheme,
    contrastRatio,
    ensureContrast,
    parseHex,
} from '../themeColors';

// The client's default level palette (contexts/GoalLevelsContext.jsx) and common picks.
const DEFAULT_LEVEL_COLORS = ['#4f9cf9', '#3bc57c', '#f59f4d', '#8b6fff', '#ef6a6a', '#ffd700', '#00a8cc'];

describe('contrastRatio', () => {
    it('matches the WCAG extremes', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    });

    it('accepts short hex and ignores alpha', () => {
        expect(parseHex('#fff')).toEqual([1, 1, 1]);
        expect(contrastRatio('#000000cc', '#fff')).toBeCloseTo(21, 5);
        expect(contrastRatio('red', '#fff')).toBeNull();
    });
});

describe('adaptColorForTheme', () => {
    it('keeps colours that already read in the dark theme', () => {
        for (const color of DEFAULT_LEVEL_COLORS) expect(adaptColorForTheme(color, 'dark')).toBe(color);
    });

    it('lightens a colour too dark for the dark theme, keeping its hue', () => {
        const navy = adaptColorForTheme('#1a237e', 'dark');
        expect(contrastRatio(navy, DARK_THEME_CARD)).toBeGreaterThanOrEqual(LIGHT_THEME_MIN_CONTRAST);
        const [r, , b] = parseHex(navy);
        expect(b).toBeGreaterThan(r);
    });

    it('holds text colours to 4.5:1 on every surface', () => {
        expect(contrastRatio(adaptColorForTheme('#f59f4d', 'light', 4.5), LIGHT_THEME_CANVAS)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(adaptColorForTheme('#2d3a8c', 'dark', 4.5), DARK_THEME_CARD)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(DEFAULT_LEVEL_COLORS)('makes %s visible on light cards', (color) => {
        const adapted = adaptColorForTheme(color, 'light');
        expect(contrastRatio(adapted, LIGHT_THEME_CARD)).toBeGreaterThanOrEqual(LIGHT_THEME_MIN_CONTRAST);
        // Darkened only as far as the target needs, not into a muddy shade.
        expect(contrastRatio(adapted, LIGHT_THEME_CARD)).toBeLessThan(LIGHT_THEME_MIN_CONTRAST + 0.6);
    });

    it('turns a pale yellow gold rather than olive', () => {
        const [r, g, b] = parseHex(adaptColorForTheme('#ffd700', 'light'));
        expect(r - g).toBeGreaterThan(0.2);
        expect(b).toBeLessThan(0.1);
    });

    it('leaves colours that already read untouched', () => {
        expect(adaptColorForTheme('#0000a2', 'light')).toBe('#0000a2');
        expect(adaptColorForTheme('#036a07', 'light')).toBe('#036a07');
    });

    it('keeps the hue family when darkening', () => {
        const [r, g, b] = parseHex(adaptColorForTheme('#3bc57c', 'light'));
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
    });

    it('passes non-hex values through', () => {
        expect(adaptColorForTheme('var(--color-brand-primary)', 'light')).toBe('var(--color-brand-primary)');
        expect(adaptColorForTheme(undefined, 'light')).toBeUndefined();
    });

    it('falls back to black on light surfaces and white on dark ones when nothing else reaches the target', () => {
        expect(ensureContrast('#777777', '#ffffff', 22)).toBe('#000000');
        expect(ensureContrast('#777777', '#000000', 22)).toBe('#ffffff');
    });
});
