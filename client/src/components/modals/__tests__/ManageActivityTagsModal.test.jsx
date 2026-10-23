import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mutations = vi.hoisted(() => ({
    createTag: vi.fn(),
    updateTag: vi.fn(),
    reorderTags: vi.fn(),
    archiveTag: vi.fn(),
    restoreTag: vi.fn(),
    hardDeleteTag: vi.fn(),
    mergeTags: vi.fn(),
    createFamily: vi.fn(),
    updateFamily: vi.fn(),
    deleteFamily: vi.fn(),
    reorderFamilies: vi.fn(),
}));
const api = vi.hoisted(() => ({
    getActivityTagImpact: vi.fn(),
    previewActivityTagCatalogMerge: vi.fn(),
}));

const usage = (instances) => ({ instances, sets: 0, circuit_scopes: 0, total: instances, tagged_instances: instances });
const families = [
    { id: 'grip', name: 'Grip', single_select: true, sort_order: 0, version: 1 },
    { id: 'surface', name: 'Surface', single_select: false, sort_order: 1, version: 1 },
];
const tags = [
    { id: 'wide', name: 'Wide', color: '#22AA77', family_id: 'grip', sort_order: 0, version: 1, archived: false, activities: [{ id: 'activity-b', name: 'Run', instances: 3 }, { id: 'activity-a', name: 'Squat', instances: 1 }], usage: usage(4) },
    { id: 'narrow', name: 'Narrow', color: '#64748B', family_id: 'grip', sort_order: 1, version: 2, archived: false, activities: [], usage: usage(0) },
    { id: 'rehab', name: 'Rehab', color: '#64748B', family_id: null, sort_order: 0, version: 3, archived: false, activities: [{ id: 'activity-b', name: 'Run' }], usage: usage(1) },
    { id: 'old', name: 'Old', color: '#64748B', family_id: null, sort_order: 1, version: 4, archived: true, activities: [], usage: usage(0) },
];

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityTagCatalog: () => ({ data: { families, tags }, isLoading: false }),
    useActivityTagCatalogMutations: () => ({ ...mutations, isPending: false }),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getActivityTagImpact: (...args) => api.getActivityTagImpact(...args),
        previewActivityTagCatalogMerge: (...args) => api.previewActivityTagCatalogMerge(...args),
    },
}));

import ManageActivityTagsModal from '../ManageActivityTagsModal';

const activities = [{ id: 'activity-a', name: 'Squat' }, { id: 'activity-b', name: 'Run' }];
const renderModal = () => render(<ManageActivityTagsModal isOpen onClose={vi.fn()} rootId="root-1" activities={activities} />);

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mutations).forEach((mutation) => mutation.mockResolvedValue({ data: {} }));
    api.getActivityTagImpact.mockResolvedValue({ data: { usage: usage(2) } });
    api.previewActivityTagCatalogMerge.mockResolvedValue({ data: { activities: [{ id: 'activity-a', name: 'Squat' }], usage: usage(3) } });
});

it('groups tags under families in picker order, with Other tags last', () => {
    renderModal();
    expect(screen.getByText('3 tags · 2 tag families')).toBeInTheDocument();
    const grip = screen.getByRole('region', { name: 'Grip' });
    expect(within(grip).getByText('Single select')).toBeInTheDocument();
    expect([...grip.querySelectorAll('li strong')].map((name) => name.textContent)).toEqual(['Wide', 'Narrow']);
    expect(within(grip).getByText('Used on Run, Squat')).toBeInTheDocument();
    // An empty family stays visible so tags can be moved into it.
    expect(within(screen.getByRole('region', { name: 'Surface' })).getByText(/No tags in this tag family yet/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Other tags' })).getByText('Rehab')).toBeInTheDocument();
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
});

it('creates a tag in a family and blocks duplicate names while typing', async () => {
    renderModal();
    const editor = screen.getByRole('region', { name: 'Create tag' });
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: '  rehab ' } });
    expect(within(editor).getByRole('alert')).toHaveTextContent('“Rehab” already exists.');
    expect(within(editor).getByRole('button', { name: 'Create tag' })).toBeDisabled();

    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'old' } });
    expect(within(editor).getByRole('alert')).toHaveTextContent('An archived tag named “Old” already exists.');
    fireEvent.click(within(editor).getByRole('button', { name: 'Restore it' }));
    await waitFor(() => expect(mutations.restoreTag).toHaveBeenCalledWith({ definitionId: 'old', version: 4 }));

    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: '  Neutral  grip ' } });
    fireEvent.change(within(editor).getByRole('combobox'), { target: { value: 'grip' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Create tag' }));
    await waitFor(() => expect(mutations.createTag).toHaveBeenCalledWith({ name: 'Neutral grip', color: '#64748B', family_id: 'grip' }));
});

it('offers to merge when renaming a tag onto an existing name', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rehab' }));
    const editor = screen.getByRole('region', { name: 'Edit Rehab' });
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'WIDE' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Merge into it' }));
    await waitFor(() => expect(api.previewActivityTagCatalogMerge).toHaveBeenCalledWith('root-1', {
        target_id: 'wide', source_ids: ['rehab'], versions: { wide: 1, rehab: 3 },
    }));
    // The merge is set up in the side panel.
    const panel = screen.getByRole('region', { name: 'Merge Rehab' });
    expect(await within(panel).findByRole('status')).toHaveTextContent('1 activity · 3 instances after merging');
    expect(within(panel).getByText(/will use “Wide” instead/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Merge tags' }));
    // Rehab has recorded instances, so the merge is confirmed first.
    expect(mutations.mergeTags).not.toHaveBeenCalled();
    const confirm = screen.getByRole('dialog', { name: 'Merge tags?' });
    expect(confirm).toHaveTextContent('1 instance tagged “Rehab” will move to “Wide”');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Merge tags' }));
    await waitFor(() => expect(mutations.mergeTags).toHaveBeenCalledWith({
        target_id: 'wide', source_ids: ['rehab'], versions: { wide: 1, rehab: 3 },
    }));
});

it('reorders tags within their whole family and reorders families', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Move Narrow earlier' }));
    await waitFor(() => expect(mutations.reorderTags).toHaveBeenCalledWith({ family_id: 'grip', tag_ids: ['narrow', 'wide'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Surface earlier' }));
    await waitFor(() => expect(mutations.reorderFamilies).toHaveBeenCalledWith(['surface', 'grip']));
});

it('creates a single-select tag family and deletes one, keeping its tags', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'New tag family' }));
    const editor = screen.getByRole('region', { name: 'Create tag family' });
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'grip ' } });
    expect(within(editor).getByRole('alert')).toHaveTextContent('A tag family named “Grip” already exists.');
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'Intensity' } });
    fireEvent.click(within(editor).getByRole('checkbox'));
    fireEvent.click(within(editor).getByRole('button', { name: 'Create tag family' }));
    await waitFor(() => expect(mutations.createFamily).toHaveBeenCalledWith({ name: 'Intensity', single_select: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete tag family Grip' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete tag family?' });
    expect(dialog).toHaveTextContent('Its tags are kept and move to Other tags.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete tag family' }));
    await waitFor(() => expect(mutations.deleteFamily).toHaveBeenCalledWith({ familyId: 'grip', version: 1 }));
});

it('picks the merge target from the tag list and cancels back to editing', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Narrow into another tag' }));
    const panel = screen.getByRole('region', { name: 'Merge Narrow' });
    expect(within(panel).getByText('Choose a tag in the list.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Merge tags' })).toBeDisabled();
    // Row actions give way to target choices; the source and archived tags cannot be chosen.
    expect(screen.queryByRole('button', { name: 'Delete Wide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge Narrow into Narrow' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Narrow into Wide' }));
    expect(screen.getByRole('button', { name: 'Merge Narrow into Wide' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Merge tags' })).toBeEnabled());
    expect(within(panel).getByText('Wide')).toBeInTheDocument();
    // Narrow is unused, so merging needs no confirmation.
    fireEvent.click(within(panel).getByRole('button', { name: 'Merge tags' }));
    await waitFor(() => expect(mutations.mergeTags).toHaveBeenCalledWith({
        target_id: 'wide', source_ids: ['narrow'], versions: { wide: 1, narrow: 2 },
    }));
    expect(screen.queryByRole('dialog', { name: 'Merge tags?' })).not.toBeInTheDocument();
});

it('cancels a merge back to editing', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Narrow into another tag' }));
    const panel = screen.getByRole('region', { name: 'Merge Narrow' });
    const [cancel, merge] = within(panel).getAllByRole('button').slice(-2);
    expect([cancel.textContent, merge.textContent]).toEqual(['Cancel', 'Merge tags']);
    fireEvent.click(cancel);
    expect(screen.queryByRole('region', { name: 'Merge Narrow' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Create tag' })).toBeInTheDocument();
});

it('opens a tag from its row and enables saving only after a change', () => {
    renderModal();
    // Tag rows have no Edit button; tag family headers keep theirs.
    expect([...document.querySelectorAll('li button')].map((button) => button.textContent)).not.toContain('Edit');
    expect(screen.getByRole('button', { name: 'Edit tag family Grip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Wide' }));
    const editor = screen.getByRole('region', { name: 'Edit Wide' });
    const save = within(editor).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: 'Wide grip' } });
    expect(save).toBeEnabled();
    fireEvent.change(within(editor).getByRole('textbox'), { target: { value: ' Wide ' } });
    expect(save).toBeDisabled();
    fireEvent.change(within(editor).getByRole('combobox'), { target: { value: '' } });
    expect(save).toBeEnabled();
});

it('counts distinct instances, not tag links, so the row matches the activity list', () => {
    tags[0].usage = { instances: 4, sets: 2, circuit_scopes: 0, total: 6, tagged_instances: 4 };
    renderModal();
    // Tagging an instance and its sets is one tagged instance, not three.
    expect(screen.getByRole('button', { name: 'Edit Wide' }).closest('li')).toHaveTextContent('4 instances');
    tags[0].usage = usage(4);
});

it('lists the activities using an open tag, most-used first', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Wide' }));
    const usedOn = screen.getByRole('region', { name: 'Activities using Wide' });
    expect(within(usedOn).getByRole('heading')).toHaveTextContent('Used on 2 activities');
    expect(within(usedOn).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Run3 instances', 'Squat1 instance']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Narrow' }));
    expect(screen.getByRole('region', { name: 'Activities using Narrow' })).toHaveTextContent('Not used on any activity yet');
});

it('previews destructive impact and requires the tag name', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wide' }));
    const dialog = await screen.findByRole('dialog', { name: 'Permanently delete tag?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'wide' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mutations.hardDeleteTag).toHaveBeenCalledWith({ definitionId: 'wide', version: 1, confirmation_name: 'wide' }));
});

it('renders the filtered empty state as a single readable message', () => {
    renderModal();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags and activities' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No tags match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Grip' })).not.toBeInTheDocument();
});
