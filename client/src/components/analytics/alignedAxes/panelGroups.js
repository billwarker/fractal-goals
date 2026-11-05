// @ts-check
/**
 * Which dashboard panels sit in line with each other, from the grid's panels: 'stacked' panels share
 * a left edge and width, 'sideBySide' panels share a top edge and height. Each next to the following
 * with no panel between them, so a chain of three forms one group.
 *
 * @typedef {{ id: string, x: number, y: number, w: number, h: number }} Panel
 */

const AXES = {
    stacked: { across: 'x', acrossSize: 'w', along: 'y', alongSize: 'h' },
    sideBySide: { across: 'y', acrossSize: 'h', along: 'x', alongSize: 'w' },
};

/**
 * @param {Panel[]} panels
 * @param {'stacked' | 'sideBySide'} direction
 * @returns {string[][]} groups of two or more panel ids, each in order along the direction
 */
export function panelGroups(panels = [], direction = 'stacked') {
    const { across, acrossSize, along, alongSize } = AXES[direction];
    const overlapsAcross = (/** @type {Panel} */ a, /** @type {Panel} */ b) => a[across] < b[across] + b[acrossSize] && b[across] < a[across] + a[acrossSize];
    const hasPanelBetween = (/** @type {Panel} */ first, /** @type {Panel} */ second) => panels.some((panel) => (
        panel !== first && panel !== second && overlapsAcross(panel, first)
        && panel[along] < second[along] && panel[along] + panel[alongSize] > first[along] + first[alongSize]
    ));

    const lines = new Map();
    panels.forEach((panel) => {
        const key = `${panel[across]}:${panel[acrossSize]}`;
        lines.set(key, [...(lines.get(key) || []), panel]);
    });

    return [...lines.values()].flatMap((line) => {
        const ordered = [...line].sort((a, b) => a[along] - b[along]);
        /** @type {Panel[][]} */
        const groups = [];
        ordered.forEach((panel, index) => {
            const previous = ordered[index - 1];
            if (previous && !hasPanelBetween(previous, panel)) groups[groups.length - 1].push(panel);
            else groups.push([panel]);
        });
        return groups.filter((group) => group.length > 1).map((group) => group.map((panel) => panel.id));
    });
}
