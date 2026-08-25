export function handleCircuitSelectionKeyDown(event, select) {
    if (event.currentTarget !== event.target || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    select(event);
}
