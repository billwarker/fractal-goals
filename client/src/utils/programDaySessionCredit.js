/** Presentation helpers for program day-review session credit facts. */

/** Credit actions the server permits for this session, in display order. */
export function sessionCreditActions(session, canEditCredits) {
    if (!canEditCredits || !session.completed) return [];
    const source = session.credit?.source;
    if (source === 'linked' || source === 'template_match') {
        return [{ key: 'exclude', label: 'Don’t count toward this day', disposition: 'exclude' }];
    }
    const actions = (session.credit_options || []).map((option) => ({
        key: `credit:${option.template_id}`,
        label: `Count as ${option.name}`,
        disposition: 'credit',
        templateId: option.template_id,
    }));
    if (source === 'manual' || session.excluded) {
        actions.push({ key: 'automatic', label: 'Use automatic credit', disposition: 'automatic' });
    }
    return actions;
}
