/**
 * Theme preference resolution. Pure: the caller supplies the clock and the system scheme.
 *
 * Mirrored by `client/public/boot/shell.js` (which runs before the bundle) and
 * validated server-side by `validators/auth.py` `AppearancePreferenceSchema`; both
 * JS copies are checked against tests/fixtures/theme_schedule_cases.json.
 */

export const THEME_MODES = ['system', 'light', 'dark', 'schedule'];
export const THEME_PREFERENCE_STORAGE_KEY = 'theme-preference';
export const DEFAULT_THEME_PREFERENCE = Object.freeze({ mode: 'system', darkFrom: '20:00', lightFrom: '07:00' });

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidScheduleTime = (value) => typeof value === 'string' && TIME_PATTERN.test(value);

const minutesOf = (value) => {
    const [, hours, minutes] = TIME_PATTERN.exec(value);
    return Number(hours) * 60 + Number(minutes);
};

/** Any stored or server value → a complete, valid preference. */
export function normalizeThemePreference(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        mode: THEME_MODES.includes(source.mode) ? source.mode : DEFAULT_THEME_PREFERENCE.mode,
        darkFrom: isValidScheduleTime(source.darkFrom) ? source.darkFrom : DEFAULT_THEME_PREFERENCE.darkFrom,
        lightFrom: isValidScheduleTime(source.lightFrom) ? source.lightFrom : DEFAULT_THEME_PREFERENCE.lightFrom,
    };
}

/**
 * Whether a schedule is dark at `minute` (minutes since local midnight). Dark runs from
 * `darkFrom` up to, not including, `lightFrom`, wrapping past midnight. Equal times
 * never switch and stay dark.
 */
function isScheduledDark(preference, minute) {
    const darkFrom = minutesOf(preference.darkFrom);
    const lightFrom = minutesOf(preference.lightFrom);
    if (darkFrom === lightFrom) return true;
    if (darkFrom < lightFrom) return minute >= darkFrom && minute < lightFrom;
    return minute >= darkFrom || minute < lightFrom;
}

/** 'light' | 'dark' for a preference at local time `now`. */
export function resolveTheme(preference, now, systemPrefersLight) {
    const { mode, darkFrom, lightFrom } = normalizeThemePreference(preference);
    if (mode === 'light' || mode === 'dark') return mode;
    if (mode === 'schedule') {
        return isScheduledDark({ darkFrom, lightFrom }, now.getHours() * 60 + now.getMinutes()) ? 'dark' : 'light';
    }
    return systemPrefersLight ? 'light' : 'dark';
}

/** The next local time a schedule changes theme, strictly after `now`; null for other modes. */
export function nextThemeSwitchAt(preference, now) {
    const { mode, darkFrom, lightFrom } = normalizeThemePreference(preference);
    if (mode !== 'schedule' || darkFrom === lightFrom) return null;
    const candidates = [darkFrom, lightFrom].map((time) => {
        const at = new Date(now);
        at.setHours(Math.floor(minutesOf(time) / 60), minutesOf(time) % 60, 0, 0);
        if (at <= now) at.setDate(at.getDate() + 1);
        return at;
    });
    return candidates[0] < candidates[1] ? candidates[0] : candidates[1];
}
