import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FilterConditions, { filterConditionLabels } from '../FilterConditions';

const none = { text: '', categories: [], goalIds: [], activityIds: [], pinnedOnly: false, day: null };

describe('FilterConditions', () => {
    it('names saved filters, search, categories, goals, activities, pinned and day', () => {
        const labels = filterConditionLabels({
            filters: { ...none, text: 'elbow', categories: ['goals'], goalIds: ['g1'], activityIds: ['a1', 'a2', 'a3'], pinnedOnly: true, day: '2026-10-23' },
            savedFilters: [{ id: 'f1', name: 'YouTube' }, { id: 'f2', name: 'Off' }], activeSavedIds: ['f1'],
            goalNames: { g1: 'Handstand' }, activityNames: {},
        });
        expect(labels).toEqual(['YouTube', '“elbow”', 'Goals', 'Handstand', '3 activities', 'Pinned', 'Oct 23, 2026']);
        render(<FilterConditions labels={labels} />);
        expect(screen.getByLabelText(/^Filtered by YouTube/)).toBeInTheDocument();
        expect(screen.getByText('Handstand')).toBeInTheDocument();
    });

    it('renders nothing when unfiltered', () => {
        const { container } = render(<FilterConditions labels={filterConditionLabels({ filters: none, savedFilters: [], activeSavedIds: [] })} />);
        expect(container).toBeEmptyDOMElement();
    });
});
