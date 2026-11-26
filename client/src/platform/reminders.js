// Which reminders the Mac schedules, and when. The server says what is due (GET /reminders/upcoming);
// the app turns that into notifications at a sensible hour, which macOS shows even while it's closed.

const STORAGE_KEY = 'mac-reminders';
const MORNING_HOUR = 9;
// macOS keeps at most 64 waiting notifications per app.
const MOST = 60;
const OPEN_SESSION_AFTER_MS = 3 * 60 * 60 * 1000;
const listeners = new Set();

/** Reminders are switched on per Mac, since each asks macOS for permission. */
export function remindersOn() {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
        return false;
    }
}

export function setRemindersOn(on) {
    try {
        if (on) localStorage.setItem(STORAGE_KEY, 'on');
        else localStorage.removeItem(STORAGE_KEY);
    } catch { /* kept for this visit only */ }
    listeners.forEach((listener) => listener());
}

export function subscribeReminders(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

const wallClock = (date) => ({
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    hour: date.getHours(), minute: date.getMinutes(),
});

const morningOf = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day, MORNING_HOUR);
};

const nextMorning = (now) => {
    const at = new Date(now);
    at.setHours(MORNING_HOUR, 0, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    return at;
};

const WORDING = {
    goal_review: (item) => ({ title: `Time to review “${item.title}”`, body: item.root_name }),
    program_day: (item) => ({ title: `Today: ${item.title}`, body: item.root_name }),
};

/**
 * Notifications for what the server says is coming, each on its morning. A review already due
 * waits for the next morning rather than being skipped; a program day that has passed is dropped.
 * The session still running is reminded of three hours after it began, once.
 */
export function planReminders({ reminders = [], preferences = {} } = {}, activeSession = null, now = new Date()) {
    const planned = [];
    for (const item of reminders) {
        const word = WORDING[item.kind];
        if (!word) continue;
        let at = morningOf(item.date);
        if (at <= now && item.kind === 'goal_review') at = nextMorning(now);
        if (at <= now) continue;
        planned.push({ id: item.id, path: item.path, when: at, ...word(item) });
    }
    const started = activeSession?.session_start ? new Date(activeSession.session_start) : null;
    if (preferences.open_session !== false && started && !Number.isNaN(started.getTime())) {
        const at = new Date(started.getTime() + OPEN_SESSION_AFTER_MS);
        if (at > now) {
            planned.push({
                id: `open_session:${activeSession.id}`, path: `/${activeSession.root_id}/session/${activeSession.id}`, when: at,
                title: `“${activeSession.name || 'Your session'}” is still running`, body: 'Finish it, or pause it until you are back.',
            });
        }
    }
    return planned
        .sort((first, second) => first.when - second.when)
        .slice(0, MOST)
        .map(({ when, ...reminder }) => ({ ...reminder, at: wallClock(when) }));
}
