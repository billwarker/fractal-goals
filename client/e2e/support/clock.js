// Program specs import `test` from here. In the `desktop-late` project the browser runs
// in America/New_York at 22:00 the evening before the server's current UTC date, so
// local and UTC calendar days differ, as they do every evening west of UTC. Other
// projects keep the real clock.
import { test as base } from '@playwright/test';

export const test = base.extend({
    lateEveningClock: [false, { option: true }],
    page: async ({ page, lateEveningClock }, provide) => {
        if (lateEveningClock) {
            const utcDate = new Date().toISOString().slice(0, 10);
            await page.clock.setSystemTime(new Date(`${utcDate}T02:00:00Z`));
        }
        await provide(page);
    },
});

/** Layout family for device-specific steps; data stays keyed by the full project name. */
export function deviceOf(testInfo) {
    return testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop';
}

export { expect } from '@playwright/test';
