import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    archiveTag: vi.fn(),
    createTag: vi.fn(),
    restoreTag: vi.fn(),
    assignInstanceTags: vi.fn(),
    getActivityTagImpact: vi.fn(),
}));

const families = [{ id: 'grip', name: 'Grip', single_select: true, sort_order: 0 }];
const catalogTags = [
    { id: 'wide', name: 'Wide', color: '#112233', family_id: 'grip', sort_order: 0, version: 1, archived: false },
    { id: 'narrow', name: 'Narrow', color: '#223344', family_id: 'grip', sort_order: 1, version: 2, archived: false },
    { id: 'paused', name: 'Paused', color: '#334455', family_id: null, sort_order: 0, version: 3, archived: false },
    { id: 'old', name: 'Old', color: '#445566', family_id: null, sort_order: 1, version: 4, archived: true },
];

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityTagCatalog: () => ({ data: { families, tags: catalogTags } }),
    useActivityTagCatalogMutations: () => ({
        updateTag: vi.fn(),
        hardDeleteTag: vi.fn(),
        archiveTag: mocks.archiveTag,
        isPending: false,
    }),
    useActivityTagMutations: () => ({
        createTag: mocks.createTag,
        restoreTag: mocks.restoreTag,
        assignInstanceTags: mocks.assignInstanceTags,
        assignSetTags: vi.fn(),
        isPending: false,
    }),
}));

vi.mock('../../../utils/api', () => ({
    fractalApi: { getActivityTagImpact: (...args) => mocks.getActivityTagImpact(...args) },
}));

import ActivityTagEditor from '../ActivityTagEditor';

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class ResizeObserver { observe() {} disconnect() {} });
    mocks.archiveTag.mockResolvedValue({ data: {} });
    mocks.assignInstanceTags.mockResolvedValue({ data: { version: 2 } });
});

afterEach(() => vi.unstubAllGlobals());

const openPicker = (props = {}) => {
    render(<ActivityTagEditor rootId="root" activityId="activity" instanceId="instance" tags={[]} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    return screen.getByRole('dialog', { name: 'Choose activity tags' });
};

it('offers every catalog tag grouped by family, with archived tags hidden', () => {
    const picker = openPicker();
    expect(within(picker).getByRole('heading', { name: /Grip/ })).toHaveTextContent('Single select');
    expect(within(picker).getByRole('heading', { name: 'Other tags' })).toBeInTheDocument();
    const grip = within(picker).getByRole('region', { name: /Grip/ });
    expect(within(grip).getAllByRole('radio').map((input) => input.closest('label').textContent)).toEqual(['Wide', 'Narrow']);
    expect(within(picker).queryByText('Old')).not.toBeInTheDocument();
});

it('replaces the sibling when choosing from a single-select family', async () => {
    const picker = openPicker({ tags: [catalogTags[0], catalogTags[2]] });
    fireEvent.click(within(picker).getByRole('radio', { name: 'Narrow' }));
    await waitFor(() => expect(mocks.assignInstanceTags).toHaveBeenCalledWith(expect.objectContaining({
        instanceId: 'instance',
        tagIds: ['paused', 'narrow'],
    })));
});

it('confirms archive and uses the catalog version', async () => {
    const picker = openPicker();
    fireEvent.click(within(picker).getByRole('button', { name: 'Archive Paused' }));
    expect(screen.getByText('Archive “Paused”?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive', exact: true }));
    await waitFor(() => expect(mocks.archiveTag).toHaveBeenCalledWith({ definitionId: 'paused', version: 3 }));
});

it('adds an existing tag instead of creating a duplicate', async () => {
    const picker = openPicker();
    fireEvent.change(within(picker).getByLabelText('New tag name'), { target: { value: ' paused ' } });
    expect(within(picker).getByRole('status')).toHaveTextContent('“Paused” already exists');
    fireEvent.click(within(picker).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.assignInstanceTags).toHaveBeenCalledWith({
        instanceId: 'instance',
        tagIds: ['paused'],
        version: 1,
        // The tag travels with the request so a queued assignment shows at once.
        tags: [expect.objectContaining({ id: 'paused', name: 'Paused' })],
    }));
    expect(mocks.createTag).not.toHaveBeenCalled();
});

it('restores an archived tag of the same name rather than creating a new one', async () => {
    mocks.restoreTag.mockResolvedValue({ data: { ...catalogTags[3], archived: false, version: 5 } });
    const picker = openPicker();
    fireEvent.change(within(picker).getByLabelText('New tag name'), { target: { value: 'OLD' } });
    expect(within(picker).getByRole('status')).toHaveTextContent('archived');
    fireEvent.click(within(picker).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mocks.restoreTag).toHaveBeenCalledWith({ definitionId: 'old', version: 4 }));
    await waitFor(() => expect(mocks.assignInstanceTags).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['old'] })));
    expect(mocks.createTag).not.toHaveBeenCalled();
});

it('creates a new catalog tag when the name is unused', async () => {
    mocks.createTag.mockResolvedValue({ data: { id: 'tempo', name: 'Tempo', archived: false, family_id: null } });
    const picker = openPicker();
    fireEvent.change(within(picker).getByLabelText('New tag name'), { target: { value: '  Tempo  ' } });
    fireEvent.click(within(picker).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mocks.createTag).toHaveBeenCalledWith({ name: 'Tempo' }));
    await waitFor(() => expect(mocks.assignInstanceTags).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['tempo'] })));
});
