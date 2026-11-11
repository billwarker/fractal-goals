import fixture from '../../../../tests/fixtures/theme_schedule_cases.json';
import shellSource from '../../../public/boot/shell.js?raw';
import {
    DEFAULT_THEME_PREFERENCE,
    nextThemeSwitchAt,
    normalizeThemePreference,
    resolveTheme,
} from '../themeSchedule';

const at = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(2026, 10, 11, hours, minutes, 0, 0);
};

const formatNext = (date, from) => {
    if (!date) return null;
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return date.getDate() === from.getDate() ? time : `${time}+1`;
};

describe('resolveTheme and nextThemeSwitchAt', () => {
    it.each(fixture.cases)('$name', ({ preference, now, systemPrefersLight, theme, next }) => {
        const clock = at(now);
        expect(resolveTheme(preference, clock, systemPrefersLight)).toBe(theme);
        expect(formatNext(nextThemeSwitchAt(preference, clock), clock)).toBe(next);
    });
});

describe('normalizeThemePreference', () => {
    it('fills a partial preference with defaults', () => {
        expect(normalizeThemePreference({ mode: 'schedule', darkFrom: '21:30' }))
            .toEqual({ mode: 'schedule', darkFrom: '21:30', lightFrom: '07:00' });
    });

    it('treats anything else as the default', () => {
        expect(normalizeThemePreference('dark')).toEqual(DEFAULT_THEME_PREFERENCE);
        expect(normalizeThemePreference(null)).toEqual(DEFAULT_THEME_PREFERENCE);
    });
});

describe('boot shell theme resolution', () => {
    const runShell = () => new Function(shellSource)();

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const stubSystemScheme = (prefersLight) => {
        vi.stubGlobal('matchMedia', (query) => ({
            matches: query === '(prefers-color-scheme: light)' ? prefersLight : false,
            addEventListener() {},
            removeEventListener() {},
        }));
    };

    it.each(fixture.cases)('matches the app resolver: $name', ({ preference, now, systemPrefersLight, theme }) => {
        vi.setSystemTime(at(now));
        stubSystemScheme(systemPrefersLight);
        if (preference !== null) localStorage.setItem('theme-preference', JSON.stringify(preference));
        runShell();
        expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
    });

    it('reads a legacy fixed theme when no preference is stored', () => {
        stubSystemScheme(false);
        localStorage.setItem('theme', 'light');
        runShell();
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
});
