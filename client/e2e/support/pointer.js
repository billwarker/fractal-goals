// Pointer drags between two elements that may sit below a scroll container's fold
// (e.g. a calendar's last week at month end). Scroll both into view, then confirm
// each point hits its own element, so a drag never silently lands on a container.
async function centerOf(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hits = await locator.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), point);
    if (!hits) throw new Error(`Drag point is covered by another element: ${await locator.evaluate((element) => element.outerHTML.slice(0, 120))}`);
    return point;
}

export async function dragBetween(page, from, to, { startOffset = null } = {}) {
    await to.scrollIntoViewIfNeeded();
    const start = await centerOf(from);
    const end = await centerOf(to);
    const origin = startOffset ? { x: (await from.boundingBox()).x + startOffset.x, y: start.y } : start;
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + 20, origin.y, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
}
