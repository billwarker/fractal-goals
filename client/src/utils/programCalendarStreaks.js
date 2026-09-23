// Server chain roles → the streak line segment drawn along the top of a cell.
const STREAK_LINK_BY_CHAIN_ROLE = { start: 'start', member: 'middle', bridge: 'bridge', end: 'end' };

/** Remove streak attributes and labels a previous decoration added to a day cell. */
export function clearStreakDecoration(dayEl, frame) {
    frame?.querySelectorAll('[data-program-streak-label]').forEach((label) => label.remove());
    dayEl.removeAttribute('data-streak-link');
    dayEl.removeAttribute('data-streak-length');
}

/**
 * Stamp the streak segment for one day from canonical chain facts. The last day
 * of a run of two or more successes ends the line in a compact length label
 * ("──── 3d"); the full "3-day streak" is the tooltip and assistive text.
 */
export function applyStreakDecoration(dayEl, frame, dayState, classNames) {
    const streakLink = STREAK_LINK_BY_CHAIN_ROLE[dayState?.chain_role];
    if (!streakLink) return;
    dayEl.setAttribute('data-streak-link', streakLink);
    const runLength = dayState.run_length_at_date;
    if (streakLink !== 'end' || runLength < 2) return;
    dayEl.setAttribute('data-streak-length', String(runLength));
    const description = `${runLength}-day streak`;
    const label = document.createElement('span');
    label.className = classNames.label;
    label.title = description;
    label.setAttribute('data-program-streak-label', 'true');
    const line = document.createElement('span');
    line.className = classNames.line;
    line.setAttribute('aria-hidden', 'true');
    const count = document.createElement('span');
    count.textContent = `${runLength}d`;
    count.setAttribute('aria-hidden', 'true');
    const assistive = document.createElement('span');
    assistive.className = classNames.assistive;
    assistive.textContent = description;
    label.append(line, count, assistive);
    frame.appendChild(label);
}
