// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
    buildTemplateData,
    moveListItem,
    moveSection,
    moveSectionItem,
    removeSectionItem,
    validateSectionDraft,
    validateTemplate,
} from '../templateBuilderState';

const template = (overrides = {}) => ({
    name: 'Practice',
    description: '',
    templateColor: '#123456',
    sections: [
        { id: 's1', name: 'Warm up', duration_minutes: 5, activities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        { id: 's2', name: 'Main', duration_minutes: 20, activities: [] },
    ],
    ...overrides,
});

describe('moveListItem', () => {
    it('swaps with the neighbour in the given direction', () => {
        expect(moveListItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
        expect(moveListItem(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
    });

    it('refuses moves past either end', () => {
        expect(moveListItem(['a', 'b'], 0, 'up')).toBeNull();
        expect(moveListItem(['a', 'b'], 1, 'down')).toBeNull();
        expect(moveListItem([], 0, 'down')).toBeNull();
    });
});

describe('template list updates', () => {
    it('returns the same template when a move is out of bounds', () => {
        const current = template();
        expect(moveSection(current, 0, 'up')).toBe(current);
        expect(moveSectionItem(current, 0, 2, 'down')).toBe(current);
    });

    it('moves an item only within its own section', () => {
        const next = moveSectionItem(template(), 0, 0, 'down');
        expect(next.sections[0].activities.map((item) => item.id)).toEqual(['b', 'a', 'c']);
        expect(next.sections[1].activities).toEqual([]);
    });

    it('ignores a missing section instead of throwing', () => {
        const current = template();
        expect(removeSectionItem(current, 9, 0)).toBe(current);
        expect(moveSectionItem(current, 9, 0, 'up')).toBe(current);
    });
});

describe('validateSectionDraft', () => {
    it('requires a non-blank name', () => {
        expect(validateSectionDraft({ name: '   ', duration_minutes: '10' }).error).toBe('Section name is required');
    });

    it('defaults blank or zero durations to 10 and rejects negatives', () => {
        expect(validateSectionDraft({ name: 'A', duration_minutes: '' })).toEqual({ error: null, duration: 10 });
        expect(validateSectionDraft({ name: 'A', duration_minutes: '0' })).toEqual({ error: null, duration: 10 });
        expect(validateSectionDraft({ name: 'A', duration_minutes: '1' })).toEqual({ error: null, duration: 1 });
        expect(validateSectionDraft({ name: 'A', duration_minutes: '-1' }).error).toBe('Duration must be at least 1 minute');
    });
});

describe('validateTemplate', () => {
    it('requires a name and at least one section', () => {
        expect(validateTemplate(template({ name: ' ' }))).toBe('Template name is required');
        expect(validateTemplate(template({ sections: [] }))).toMatch(/at least one section/);
        expect(validateTemplate(template())).toBeNull();
    });
});

describe('buildTemplateData', () => {
    it('serializes sections of items with the total duration and no session type', () => {
        const data = buildTemplateData(template(), { totalDuration: 25 });
        expect(data).not.toHaveProperty('session_type');
        expect(data).not.toHaveProperty('activities');
        expect(data.template_color).toBe('#123456');
        expect(data.total_duration_minutes).toBe(25);
        expect(data.sections).toHaveLength(2);
        expect(data.sections[0]).not.toHaveProperty('activities');
        expect(data.sections[0].items).toHaveLength(3);
    });
});
