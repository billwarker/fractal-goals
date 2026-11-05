import { describe, expect, it } from 'vitest';

import { normalizeGlobalFilters } from '../../analyticsGlobalFilters';
import { activeFilterIds, filterSections, getFilterCapabilities, pageFilterCapabilities } from '../capabilities';
import { VISUALIZATION_REGISTRY } from '../registry';

const goals = getFilterCapabilities('goals');
const activities = getFilterCapabilities('activities');
const sessions = getFilterCapabilities('sessions');

describe('filter capabilities', () => {
    it('declares only filters each category actually applies', () => {
        expect(goals).toEqual({ core: [], optional: ['timeRange', 'goals', 'activities'] });
        expect(sessions.optional).not.toContain('tags');
        expect(activities.optional).toContain('tags');
        // Every registered chart resolves to a declaration.
        VISUALIZATION_REGISTRY.forEach((visualization) => {
            expect(getFilterCapabilities(visualization.category, visualization).core).not.toContain('timeRange');
            expect(getFilterCapabilities(visualization.category, visualization).optional).toContain('timeRange');
        });
    });

    it('shows the selected chart’s core and added filters, other panels’ core filters, and anything set', () => {
        expect(filterSections({ selected: activities, openPanels: [activities], active: [] }))
            .toMatchObject({ visible: [], addable: ['timeRange', 'goals', 'activities', 'tags', 'templates', 'programDays'] });
        expect(filterSections({ selected: activities, shownFilters: ['tags', 'bogus'], openPanels: [activities, goals], active: ['programDays'] }))
            .toMatchObject({ visible: ['tags', 'programDays'], addable: ['timeRange', 'goals', 'activities', 'templates'] });
        // An optional filter added to another chart isn't shown for this one.
        expect(filterSections({ selected: goals, shownFilters: ['tags'], openPanels: [goals], active: [] }).visible)
            .toEqual([]);
    });

    it('starts with no filters, offering time range through Add Filters', () => {
        const others = ['timeRange', 'goals', 'activities', 'tags', 'templates', 'programDays'];
        expect(pageFilterCapabilities([])).toEqual({ core: [], optional: others });
        expect(filterSections({ selected: null, openPanels: [], active: [] }))
            .toEqual({ visible: [], addable: others, optional: others });
        // The open charts decide: a goal chart offers goals and activities, nothing it ignores.
        expect(filterSections({ selected: null, openPanels: [goals], active: [] }))
            .toMatchObject({ visible: [], addable: ['timeRange', 'goals', 'activities'] });
        expect(filterSections({ selected: null, shownFilters: ['goals'], openPanels: [], active: ['programDays'] }).visible)
            .toEqual(['goals', 'programDays']);
    });

    it('keeps chosen or active time ranges editable without forcing them on other views', () => {
        expect(filterSections({ selected: activities, shownFilters: ['timeRange'], openPanels: [activities], active: [] }).visible).toEqual(['timeRange']);
        expect(filterSections({ selected: activities, openPanels: [activities], active: ['timeRange'] }).visible).toEqual(['timeRange']);
    });

    it('lists the filters that are set', () => {
        const filters = normalizeGlobalFilters({ tags: { tagIds: [], match: 'exact' }, sessions: { templateIds: ['t'] } });
        expect(activeFilterIds(filters, { start: '2026-01-01' })).toEqual(['timeRange', 'tags', 'templates']);
        expect(activeFilterIds(normalizeGlobalFilters({}), {})).toEqual([]);
    });
});
