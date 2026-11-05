// @ts-check
/**
 * Charts whose plots must share left and right edges. pageGridSnap reports the space each chart has
 * (in page-grid coordinates) and lays the plot out in what they all share; when that shared space
 * changes, the others lay out again. Notifying is capped, so charts that keep changing each other's
 * tick labels settle instead of looping.
 */

const MAX_NOTIFICATIONS = 8;

export function createEdgeGroup() {
    /** @type {Map<any, { left: number, right: number }>} */
    const members = new Map();
    let notifications = 0;

    const target = () => {
        const edges = [...members.values()];
        return {
            left: Math.max(...edges.map((edge) => edge.left)),
            right: Math.min(...edges.map((edge) => edge.right)),
        };
    };
    const refresh = (/** @type {any} */ except) => {
        if (notifications >= MAX_NOTIFICATIONS) return;
        notifications += 1;
        members.forEach((_edges, chart) => {
            if (chart === except || !chart.canvas) return;
            chart.$pageGridPasses = 0;
            requestAnimationFrame(() => {
                if (chart.canvas) chart.update('none');
            });
        });
    };

    return {
        /**
         * @param {any} chart
         * @param {{ left: number, right: number }} edges this chart's own space
         * @returns {{ left: number, right: number }} the space to lay out in
         */
        report(chart, edges) {
            const before = members.size ? target() : null;
            members.set(chart, edges);
            const after = target();
            const moved = !before || Math.abs(before.left - after.left) >= 0.5 || Math.abs(before.right - after.right) >= 0.5;
            if (moved && members.size > 1) refresh(chart);
            return after;
        },
        /** @param {any} chart */
        join(chart) {
            notifications = 0;
            chart.$alignedEdges = this;
            chart.update('none');
        },
        /** @param {any} chart */
        leave(chart) {
            delete chart.$alignedEdges;
            chart.$pageGridPasses = 0;
            if (chart.canvas) chart.update('none');
            if (members.delete(chart) && members.size) refresh(chart);
        },
        /** A panel resized or a chart changed: charts may move for real again. */
        restart() {
            notifications = 0;
        },
        get size() {
            return members.size;
        },
    };
}
