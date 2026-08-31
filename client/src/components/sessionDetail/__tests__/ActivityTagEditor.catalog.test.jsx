import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    archiveTag: vi.fn(),
    updateCatalogTag: vi.fn(),
    assignInstanceTags: vi.fn(),
    getActivityTagImpact: vi.fn(),
}));

const definitions = [
    { id: 'definition-assigned', name: 'Assigned tag', color: '#112233', scope: 'selected', version: 1, archived: false, activity_ids: ['activity'] },
    { id: 'definition-global', name: 'Global tag', color: '#223344', scope: 'global', version: 2, archived: false, activity_ids: ['activity'] },
    { id: 'definition-local', name: 'Local tag', color: '#334455', scope: 'selected', version: 3, archived: false, activity_ids: ['activity'] },
    { id: 'definition-match', name: 'Reusable', color: '#445566', scope: 'selected', version: 4, archived: false, activity_ids: ['other'] },
];

vi.mock('../../../hooks/useActivityProgressViews', () => ({
    useActivityTagCatalog: () => ({ data: { tags: definitions, duplicate_groups: [] } }),
    useActivityTagMutations: () => ({
        createTag: vi.fn(),
        updateCatalogTag: mocks.updateCatalogTag,
        hardDeleteCatalogTag: vi.fn(),
        archiveTag: mocks.archiveTag,
        assignInstanceTags: mocks.assignInstanceTags,
        assignSetTags: vi.fn(),
        isPending: false,
    }),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: { getActivityTagImpact: (...args) => mocks.getActivityTagImpact(...args) },
}));

import ActivityTagEditor from '../ActivityTagEditor';

const availableTags = [
    { id: 'binding-assigned', definition_id: 'definition-assigned', name: 'Assigned tag', scope: 'selected', color: '#112233' },
    { id: 'binding-global', definition_id: 'definition-global', name: 'Global tag', scope: 'global', color: '#223344' },
    { id: 'binding-local', definition_id: 'definition-local', name: 'Local tag', scope: 'selected', color: '#334455' },
    { id: 'binding-local', definition_id: 'definition-local', name: 'Local tag', scope: 'selected', color: '#334455' },
];

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class ResizeObserver { observe() {} disconnect() {} });
    mocks.archiveTag.mockResolvedValue({ data: {} });
    mocks.assignInstanceTags.mockResolvedValue({ data: { version: 2 } });
    mocks.updateCatalogTag.mockResolvedValue({ data: {
        ...definitions[3],
        activity_ids: ['other', 'activity'],
        bindings: [{ id: 'binding-reusable', definition_id: 'definition-match', activity_definition_id: 'activity', name: 'Reusable', scope: 'selected' }],
    } });
});

afterEach(() => vi.unstubAllGlobals());

it('groups and defensively deduplicates assigned, global, and activity-specific choices', () => {
    render(<ActivityTagEditor rootId="root" activityId="activity" instanceId="instance" availableTags={availableTags} tags={[availableTags[0]]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const picker = screen.getByRole('dialog', { name: 'Choose activity tags' });
    expect(within(picker).getByRole('heading', { name: 'Assigned' })).toBeInTheDocument();
    expect(within(picker).getByRole('heading', { name: 'Every activity' })).toBeInTheDocument();
    expect(within(picker).getByRole('heading', { name: 'This activity' })).toBeInTheDocument();
    expect(within(picker).getAllByText('Local tag')).toHaveLength(1);
});

it('confirms archive and uses the catalog definition version', async () => {
    render(<ActivityTagEditor rootId="root" activityId="activity" instanceId="instance" availableTags={availableTags} tags={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Global tag' }));
    expect(screen.getByText('Archive “Global tag”?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive', exact: true }));
    await waitFor(() => expect(mocks.archiveTag).toHaveBeenCalledWith({ definitionId: 'definition-global', version: 2 }));
});

it('extends an existing catalog match instead of creating a duplicate', async () => {
    render(<ActivityTagEditor rootId="root" activityId="activity" instanceId="instance" availableTags={availableTags} tags={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: ' reusable ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mocks.updateCatalogTag).toHaveBeenCalledWith({
        definitionId: 'definition-match', version: 4, activity_ids: ['other', 'activity'], scope: 'selected',
    }));
    expect(mocks.assignInstanceTags).toHaveBeenCalledWith({ instanceId: 'instance', tagIds: ['binding-reusable'], version: 1 });
});
