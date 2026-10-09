const DAY_MS = 86400000;

export function buildHeatmapCalendar(days = []) {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return { columns: [], months: [], years: [] };
    const byDate = new Map(sorted.map((day) => [day.date, day]));
    const first = new Date(`${sorted[0].date}T00:00:00Z`);
    const last = new Date(`${sorted.at(-1).date}T00:00:00Z`);
    const start = first.getTime() - first.getUTCDay() * DAY_MS;
    const end = last.getTime() + (6 - last.getUTCDay()) * DAY_MS;
    const columns = [];
    const months = [];
    const years = [];
    let previousMonth;
    let previousYear;
    for (let week = start; week <= end; week += 7 * DAY_MS) {
        const column = [];
        for (let row = 0; row < 7; row += 1) {
            const value = new Date(week + row * DAY_MS);
            const date = value.toISOString().slice(0, 10);
            column.push({
                count: 0, activities: 0, events: 0, duration_seconds: 0, milestones: 0,
                ...byDate.get(date), date, inRange: value >= first && value <= last,
            });
        }
        const firstDay = column.find((day) => day.inRange);
        const month = firstDay?.date.slice(0, 7);
        // A year boundary belongs to the week containing its first in-range date.
        for (const day of column.filter((day) => day.inRange)) {
            const year = day.date.slice(0, 4);
            if (year !== previousYear) {
                const previous = years.at(-1);
                if (previous && columns.length - previous.column < 6) previous.label += ` / ${year}`;
                else years.push({ column: columns.length, label: year });
                previousYear = year;
            }
        }
        if (month && month !== previousMonth) {
            // A short first month must not collide with the next month's label.
            if (months.length && columns.length - months.at(-1).column < 3) months.pop();
            months.push({ column: columns.length, label: new Date(`${firstDay.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) });
            previousMonth = month;
        }
        columns.push(column);
    }
    return { columns, months, years };
}

export function heatmapIntensity(value, metric = 'activities') {
    if (!(value > 0)) return 0;
    const thresholds = metric === 'duration' ? [15, 30, 60] : [2, 4, 7];
    return thresholds.findIndex((threshold) => value < threshold) + 1 || 4;
}
