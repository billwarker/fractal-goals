import { expect } from '@playwright/test';

// Opens a goal's details from the flow tree and waits for `ready` inside them. The tree fades
// in, so an early click can miss and is retried; a click that is already loading the details
// is not, because the tree reflows as the panel opens and a second click can land on the
// node's "+ Add" button instead of its name.
export async function openGoalFromTree(page, goalName, ready) {
    const name = page.locator('.react-flow__node').filter({ hasText: goalName }).getByText(goalName, { exact: true });
    const loading = page.getByText('Loading goal details…');
    await expect(async () => {
        if (!(await loading.isVisible()) && !(await ready.isVisible())) await name.click();
        await expect(ready).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 25_000 });
}
