import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const createTag = vi.fn();
const updateTag = vi.fn();
const archiveTag = vi.fn();
const restoreTag = vi.fn();
const hardDeleteTag = vi.fn();
const mergeTags = vi.fn();
const getActivityTagImpact = vi.fn();
const previewActivityTagCatalogMerge = vi.fn();

const tags = [
    {
        id: 'tag-a', name: 'Rehab', normalized_name: 'rehab', color: '#22AA77', scope: 'selected',
        sort_order: 0, version: 1, archived: false, activity_ids: ['activity-a'],
        activities: [{ id: 'activity-a', name: 'Squat' }], usage: { instances: 2, sets: 0, progress_views: 1, circuit_scopes: 0, total: 3 },
    },
    {
        id: 'tag-b', name: 'rehab', normalized_name: 'rehab', color: '#64748B', scope: 'selected',
        sort_order: 1, version: 2, archived: false, activity_ids: ['activity-b'],
        activities: [{ id: 'activity-b', name: 'Run' }], usage: { instances: 0, sets: 0, progress_views: 0, circuit_scopes: 0, total: 0 },
    },
];

vi.mock('../../../hooks/useActivityProgressViews', () => ({
    useActivityTagCatalog: () => ({
        data: { tags, duplicate_groups: [{ normalized_name: 'rehab', definition_ids: ['tag-a', 'tag-b'] }] },
        isLoading: false,
    }),
    useActivityTagCatalogMutations: () => ({
        createTag, updateTag, archiveTag, restoreTag, hardDeleteTag, mergeTags, isPending: false,
    }),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getActivityTagImpact: (...args) => getActivityTagImpact(...args),
        previewActivityTagCatalogMerge: (...args) => previewActivityTagCatalogMerge(...args),
    },
}));

import ManageActivityTagsModal from '../ManageActivityTagsModal';

const activities = [{ id: 'activity-a', name: 'Squat' }, { id: 'activity-b', name: 'Run' }];

beforeEach(() => {
    vi.clearAllMocks();
    createTag.mockResolvedValue({ data: {} });
    mergeTags.mockResolvedValue({ data: {} });
    hardDeleteTag.mockResolvedValue({ data: {} });
    getActivityTagImpact.mockResolvedValue({ data: { usage: tags[0].usage } });
    previewActivityTagCatalogMerge.mockResolvedValue({ data: { activity_ids: ['activity-a', 'activity-b'], usage: { instances: 2, sets: 0, total: 3 }, binding_rewrites: 0 } });
});

it('shows the complete fractal catalog and creates a global tag', async () => {
    render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);

    expect(screen.getByText('2 tags across 2 activities')).toBeInTheDocument();
    expect(screen.getByText('1 duplicate group needs review')).toBeInTheDocument();
    expect(screen.getAllByText(/rehab/i)).toHaveLength(2);
    expect(screen.getByText('2 instances')).toBeInTheDocument();
    expect(screen.queryByText(/dependenc/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deload' } });
    fireEvent.click(screen.getByLabelText('Every activity in this fractal'));
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));
    await waitFor(() => expect(createTag).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Deload', scope: 'global', activity_ids: [],
    })));
});

it('renders the filtered empty state as a single readable message', () => {
    render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);
    fireEvent.change(screen.getByLabelText('Search tags and activities'), {
        target: { value: 'not-a-tag' },
    });
    expect(screen.getByText('No tags match these filters.')).toBeInTheDocument();
});

it('merges a reviewed duplicate group into the chosen tag', async () => {
    render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Merge' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Merge duplicate tags?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge tags' }));
    await waitFor(() => expect(mergeTags).toHaveBeenCalledWith({
        target_id: 'tag-a', source_ids: ['tag-b'], versions: { 'tag-a': 1, 'tag-b': 2 }, scope: 'selected',
    }));
});

it('previews destructive impact and requires the tag name', async () => {
    render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(getActivityTagImpact).toHaveBeenCalledWith('root-1', 'tag-a'));
    const dialog = await screen.findByRole('dialog', { name: 'Permanently delete tag?' });
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete permanently' });
    expect(deleteButton).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Rehab' } });
    fireEvent.click(deleteButton);
    await waitFor(() => expect(hardDeleteTag).toHaveBeenCalledWith({
        definitionId: 'tag-a', version: 1, confirmation_name: 'Rehab',
    }));
});

it('previews scope reductions without deleting historical usage', async () => {
    updateTag.mockResolvedValue({ data: {} });
    render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);
    fireEvent.click(screen.getByRole('button', { name: /RehabSquat/i }));
    fireEvent.click(screen.getByLabelText('Squat'));
    fireEvent.click(screen.getByLabelText('Run'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const dialog = screen.getByRole('dialog', { name: 'Reduce tag availability?' });
    expect(within(dialog).getByText(/remain historical and are not removed/i)).toBeInTheDocument();
    expect(updateTag).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update availability' }));
    await waitFor(() => expect(updateTag).toHaveBeenCalledWith(expect.objectContaining({
        definitionId: 'tag-a', activity_ids: ['activity-b'],
    })));
});
