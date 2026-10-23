import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import ProgressPanel from '../ProgressPanel';

const EMPTY_TIMELINE = { items: [], total: 0, total_all: 0 };
const useActivityProgressTimeline = vi.fn(() => ({ data: EMPTY_TIMELINE, isLoading: false, error: null }));
const setComparison = vi.fn();
const useActivityProgressSeries = vi.fn(() => ({ data: null, isLoading: false }));
const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigate,
}));

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityProgressTimeline: (...args) => useActivityProgressTimeline(...args),
    useActivityProgressSeries: (...args) => useActivityProgressSeries(...args),
    useProgressComparisonMutation: () => ({ setComparison, isPending: false }),
    useActivityTagCatalog: () => ({ data: {
        families: [{ id: 'grip', name: 'Grip', single_select: true, sort_order: 0 }],
        tags: [
            { id: 'heavy', name: 'Heavy', activities: [{ id: 'activity-def-1' }] },
            { id: 'paused', name: 'Paused', activities: [{ id: 'activity-def-1' }] },
            { id: 'wide', name: 'Wide', family_id: 'grip', sort_order: 0, activities: [{ id: 'activity-def-1' }] },
            { id: 'narrow', name: 'Narrow', family_id: 'grip', sort_order: 1, activities: [{ id: 'activity-def-1' }] },
            { id: 'elsewhere', name: 'Only on another activity', activities: [{ id: 'activity-def-2' }] },
        ],
    } }),
    useActivityTagCatalogMutations: () => ({ isPending: false }),
    useActivityTagMutations: () => ({ isPending: false }),
}));

vi.mock('../../goalDetail/ConditionProgressChart', () => ({
    default: ({ condition, instances, highlightInstanceId }) => (
        <div data-testid="progress-chart">{condition.measure}:{instances.length}:{highlightInstanceId}</div>
    ),
}));

vi.mock('../NoteTimeline', () => ({
    default: ({ notes }) => (
        <div>
            {notes.map((note) => (
                <div key={note.id}>{note.content}</div>
            ))}
        </div>
    ),
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' }),
    };
});

const sessionActivityDefs = [
    { id: 'activity-def-1', name: 'Scales', metric_definitions: [] },
    { id: 'activity-def-2', name: 'Arpeggios', metric_definitions: [] },
];
const instance = (overrides = {}) => ({
    id: 'instance-current',
    activity_definition_id: 'activity-def-1',
    tags: [{ id: 'heavy', name: 'Heavy' }],
    comparison_context: { mode: 'same_tags', tag_ids: ['heavy'], tags: [{ id: 'heavy', name: 'Heavy' }], version: 1 },
    ...overrides,
});
const providers = { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false };

describe('ProgressPanel tags, scope and chart', () => {
    beforeEach(() => {
        useActivityProgressTimeline.mockClear();
        setComparison.mockReset().mockResolvedValue({});
        useActivityProgressTimeline.mockReturnValue({ data: EMPTY_TIMELINE, isLoading: false, error: null });
        useActivityProgressSeries.mockReturnValue({ data: null, isLoading: false });
        window.localStorage.clear();
    });

    it('offers this activity\'s tags as chips, keeping single-select families to one', async () => {
        const chosen = instance({ comparison_context: { mode: 'tags', tag_ids: ['wide'], tags: [], version: 2 } });
        renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={chosen} sessionActivityDefs={sessionActivityDefs} sessionInstances={[chosen]} />,
            providers,
        );
        const chips = screen.getByLabelText('Tags to compare with');
        expect(within(chips).queryByRole('button', { name: 'Only on another activity' })).not.toBeInTheDocument();
        expect(within(chips).queryByRole('button', { name: '+ Tag' })).not.toBeInTheDocument();
        expect(within(chips).getByRole('button', { name: 'Wide' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(chips).getByRole('button', { name: 'Narrow' }));
        await waitFor(() => expect(setComparison).toHaveBeenCalledWith(expect.objectContaining({ mode: 'tags', tagIds: ['narrow'] })));
        fireEvent.click(within(chips).getByRole('button', { name: 'Paused' }));
        await waitFor(() => expect(setComparison).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: ['wide', 'paused'] })));
    });

    it('narrows to the same template and/or program day, disabling what the session lacks', async () => {
        const scoped = instance({ comparison_context: {
            mode: 'same_tags', tag_ids: ['heavy'], tags: [], version: 3, same_template: true, same_program_day: false,
            template: { id: 'tpl', name: 'Upper Body' }, program_day: null, remembered_for: 'Upper Body',
        } });
        renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={scoped} sessionActivityDefs={sessionActivityDefs} sessionInstances={[scoped]} />,
            providers,
        );
        expect(useActivityProgressTimeline).toHaveBeenLastCalledWith('root-1', 'activity-def-1', {
            instanceId: 'instance-current', preview: { mode: 'tags', tagIds: ['heavy'], sameTemplate: true, sameProgramDay: false }, limit: 20,
        });
        // A remembered comparison starts collapsed, summarized in the header.
        const header = screen.getByRole('button', { name: /Same template/ });
        expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('heading', { name: 'Compare with' })).toBeInTheDocument();
        // Below a divider, the compared tags show with tag styling.
        expect(screen.getByRole('separator')).toBeInTheDocument();
        expect(screen.getByLabelText('Compared tags')).toHaveTextContent('Heavy');
        expect(screen.queryByRole('checkbox', { name: /Same template/ })).not.toBeInTheDocument();
        fireEvent.click(header);
        const template = screen.getByRole('checkbox', { name: /Same template/ });
        // Within comes before the tag choice.
        expect(template.compareDocumentPosition(screen.getByRole('radio', { name: 'Same tags' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(template).toBeChecked();
        expect(template.closest('label')).toHaveTextContent('Upper Body');
        expect(screen.getByRole('checkbox', { name: /Same program day/ })).toBeDisabled();
        fireEvent.click(template);
        await waitFor(() => expect(setComparison).toHaveBeenCalledWith(expect.objectContaining({ sameTemplate: false, version: 3 })));
    });

    it('charts the scoped sessions and links to the same chart in Analytics', () => {
        const scoped = instance({ comparison_context: {
            mode: 'tags', tag_ids: ['paused'], tags: [], version: 1, same_template: true, same_program_day: false,
            template: { id: 'tpl', name: 'Upper' }, program_day: null,
        } });
        useActivityProgressSeries.mockReturnValue({ isLoading: false, data: {
            chart: { source: 'goal_condition', goal_name: 'Front lever', condition: { measure: 'sets', rules: [{ metric_definition_id: 'm1' }] } },
            activity_definition: { id: 'activity-def-1', yield_metric_ids: [] },
            instances: [{ id: 'a' }, { id: 'instance-current' }],
            current_instance_id: 'instance-current',
        } });
        renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={scoped} sessionActivityDefs={sessionActivityDefs} sessionInstances={[scoped]} />,
            providers,
        );
        const chart = screen.getByRole('link', { name: 'Goal: Front lever. Open in Analytics' });
        expect(within(chart).getByTestId('progress-chart')).toHaveTextContent('sets:2:instance-current');
        // The chart sits above the comparison controls.
        const compare = screen.getByRole('button', { name: /Any session|Same day|Same template/ });
        expect(chart.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        const href = '/root-1/analytics?activity=activity-def-1&viz=metricTrends&metrics=m1&tags=paused&tagMatch=exact&template=tpl';
        fireEvent.click(within(chart).getByTestId('progress-chart'));
        expect(navigate).toHaveBeenLastCalledWith(href);
        navigate.mockClear();
        fireEvent.keyDown(chart, { key: 'Enter' });
        expect(navigate).toHaveBeenLastCalledWith(href);
    });

    it('remembers whether the widget is open per activity, template and program day', () => {
        const inTemplate = (templateId) => instance({ comparison_context: {
            mode: 'same_tags', tag_ids: [], tags: [], version: 1, same_template: false, same_program_day: false,
            template: { id: templateId, name: templateId }, program_day: null,
        } });
        const { unmount } = renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={inTemplate('upper')} sessionActivityDefs={sessionActivityDefs} sessionInstances={[inTemplate('upper')]} />,
            providers,
        );
        // Nothing remembered yet: open, so the comparison can be set up.
        const header = screen.getByRole('button', { name: /Any session|Same day|Same template/ });
        expect(header).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(header);
        expect(header).toHaveAttribute('aria-expanded', 'false');
        unmount();

        const again = renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={inTemplate('upper')} sessionActivityDefs={sessionActivityDefs} sessionInstances={[inTemplate('upper')]} />,
            providers,
        );
        expect(screen.getByRole('button', { name: /Any session|Same day|Same template/ })).toHaveAttribute('aria-expanded', 'false');
        again.unmount();
        renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={inTemplate('lower')} sessionActivityDefs={sessionActivityDefs} sessionInstances={[inTemplate('lower')]} />,
            providers,
        );
        expect(screen.getByRole('button', { name: /Any session|Same day|Same template/ })).toHaveAttribute('aria-expanded', 'true');
    });

    it('names both scopes as Same day | Same template and summarizes All history', () => {
        const both = instance({ comparison_context: {
            mode: 'all', tag_ids: [], tags: [], version: 1, same_template: true, same_program_day: true,
            template: { id: 'tpl', name: 'Upper' }, program_day: { id: 'day', name: 'Day A' }, remembered_for: 'Day A',
        } });
        renderWithProviders(
            <ProgressPanel rootId="root-1" selectedActivity={both} sessionActivityDefs={sessionActivityDefs} sessionInstances={[both]} />,
            providers,
        );
        const header = screen.getByRole('button', { name: /Same day \| Same template/ });
        expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('region', { name: 'Compare with' })).toHaveTextContent('All history');
    });
});
