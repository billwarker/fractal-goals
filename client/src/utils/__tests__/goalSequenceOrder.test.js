import { describe, expect, it } from 'vitest';

import { orderSequencedSiblings } from '../goalSequenceOrder';

const ids = (nodes) => nodes.map((node) => node.id);

describe('orderSequencedSiblings', () => {
    it('groups each track at its first member, in position order, keeping other siblings in place', () => {
        const nodes = [
            { id: 'x' },
            { id: 'b2', sequence_track_id: 'b', sequence_position: 2 },
            { id: 'a2', attributes: { sequence_track_id: 'a', sequence_position: 2 } },
            { id: 'y' },
            { id: 'b1', sequence_track_id: 'b', sequence_position: 1 },
            { id: 'a1', attributes: { sequence_track_id: 'a', sequence_position: 1 } },
        ];
        expect(ids(orderSequencedSiblings(nodes))).toEqual(['x', 'b1', 'b2', 'a1', 'a2', 'y']);
    });

    it('returns the same array when nothing is sequenced', () => {
        const nodes = [{ id: 'x' }, { id: 'y' }];
        expect(orderSequencedSiblings(nodes)).toBe(nodes);
    });
});
