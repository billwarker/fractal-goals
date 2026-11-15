// @vitest-environment node
import { distinctQuickSessions, orderedSessionInstances, quickSessionSelectionKey } from '../quickSessionSummary';

const quick = (id, activityIds) => ({
    id,
    attributes: { session_data: { activity_ids: activityIds.map((_, index) => `${id}-${index}`) } },
    activity_instances: activityIds.map((activityId, index) => ({ id: `${id}-${index}`, activity_definition_id: activityId })),
});

describe('orderedSessionInstances', () => {
    it('follows the logged order and keeps instances it does not list', () => {
        const session = {
            attributes: { session_data: { activity_ids: ['b', 'a'] } },
            activity_instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        };
        expect(orderedSessionInstances(session).map((instance) => instance.id)).toEqual(['b', 'a', 'c']);
        expect(orderedSessionInstances({ activity_instances: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
        expect(orderedSessionInstances(null)).toEqual([]);
    });
});

describe('distinctQuickSessions', () => {
    it('keys a session by which activities it logged, whatever their order or repeats', () => {
        expect(quickSessionSelectionKey(quick('s', ['b', 'a', 'b']))).toBe(quickSessionSelectionKey(quick('t', ['a', 'b'])));
        expect(quickSessionSelectionKey(quick('s', ['a']))).not.toBe(quickSessionSelectionKey(quick('t', ['a', 'b'])));
    });

    it('keeps the latest session of each selection, newest first, up to the limit', () => {
        const sessions = [
            quick('newest-weigh', ['weigh']),
            quick('scales-and-weigh', ['scales', 'weigh']),
            quick('older-weigh', ['weigh']),
            quick('empty', []),
            quick('weigh-and-scales', ['weigh', 'scales']),
            quick('chords', ['chords']),
            quick('ears', ['ears']),
        ];
        expect(distinctQuickSessions(sessions, 5).map((session) => session.id)).toEqual([
            'newest-weigh', 'scales-and-weigh', 'chords', 'ears',
        ]);
        expect(distinctQuickSessions(sessions, 2).map((session) => session.id)).toEqual(['newest-weigh', 'scales-and-weigh']);
    });
});
