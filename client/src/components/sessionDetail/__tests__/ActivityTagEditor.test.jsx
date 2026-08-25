import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../hooks/useActivityProgressViews', () => ({
    useActivityTagMutations: () => ({
        createTag: vi.fn(),
        assignInstanceTags: vi.fn(),
        assignSetTags: vi.fn(),
        isPending: false,
    }),
}));

import ActivityTagEditor from '../ActivityTagEditor';

let resizeCallback;

beforeEach(() => {
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
        constructor(callback) {
            resizeCallback = callback;
        }

        observe() {}

        disconnect() {}
    });
});

afterEach(() => vi.unstubAllGlobals());

it('replaces assigned tags with a count badge only while their container overflows', () => {
    const tags = [
        { id: 'one', name: 'One' },
        { id: 'two', name: 'Two' },
        { id: 'three', name: 'Three' },
        { id: 'four', name: 'Four' },
    ];
    render(
        <ActivityTagEditor
            rootId="root"
            activityId="activity"
            instanceId="instance"
            availableTags={tags}
            tags={tags}
        />,
    );

    const editor = screen.getByRole('group', { name: 'Activity tags' });
    const tagRow = editor.firstElementChild;
    const measure = tagRow.querySelector('[aria-hidden="true"]');
    const trigger = within(editor).getByRole('button', { name: 'Add tag' });
    let availableWidth = 180;
    Object.defineProperty(tagRow, 'clientWidth', { configurable: true, get: () => availableWidth });
    Object.defineProperty(measure, 'scrollWidth', { configurable: true, get: () => 240 });
    trigger.getBoundingClientRect = () => ({ width: 52 });

    act(() => resizeCallback());
    expect(screen.getByLabelText('4 tags assigned')).toHaveTextContent('4 tags');
    expect(within(editor).queryAllByRole('checkbox')).toHaveLength(0);
    expect(trigger).toBeVisible();

    availableWidth = 360;
    act(() => resizeCallback());
    expect(screen.queryByLabelText('4 tags assigned')).not.toBeInTheDocument();
    expect(within(editor).getAllByRole('checkbox')).toHaveLength(4);
});

it('keeps a single-tag overflow summary stable near the fit boundary', () => {
    const tags = [{ id: 'one', name: 'Test' }];
    render(
        <ActivityTagEditor
            rootId="root"
            activityId="activity"
            instanceId="instance"
            availableTags={tags}
            tags={tags}
        />,
    );

    const editor = screen.getByRole('group', { name: 'Activity tags' });
    const tagRow = editor.firstElementChild;
    const measure = tagRow.querySelector('[aria-hidden="true"]');
    const trigger = within(editor).getByRole('button', { name: 'Add tag' });
    let availableWidth = 96;
    Object.defineProperty(tagRow, 'clientWidth', { configurable: true, get: () => availableWidth });
    Object.defineProperty(measure, 'scrollWidth', { configurable: true, get: () => 40 });
    trigger.getBoundingClientRect = () => ({ width: 52 });

    act(() => resizeCallback());
    expect(screen.getByLabelText('1 tag assigned')).toBeInTheDocument();

    availableWidth = 100;
    act(() => resizeCallback());
    expect(screen.getByLabelText('1 tag assigned')).toBeInTheDocument();

    availableWidth = 120;
    act(() => resizeCallback());
    expect(screen.queryByLabelText('1 tag assigned')).not.toBeInTheDocument();
    expect(within(editor).getByRole('checkbox')).toBeInTheDocument();
});

it('shows assigned tags read-only without an add trigger when editing is inactive', () => {
    const tags = [{ id: 'one', name: 'Test' }];
    render(
        <ActivityTagEditor
            rootId="root"
            activityId="activity"
            instanceId="instance"
            availableTags={tags}
            tags={tags}
            editable={false}
        />,
    );

    const editor = screen.getByRole('group', { name: 'Activity tags' });
    expect(within(editor).getByText('Test')).toBeInTheDocument();
    expect(within(editor).getByRole('checkbox')).toBeDisabled();
    expect(within(editor).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
});

it('places a header trigger before its assigned tags', () => {
    const tags = [{ id: 'one', name: 'Test' }];
    render(
        <ActivityTagEditor
            rootId="root"
            activityId="activity"
            instanceId="instance"
            availableTags={tags}
            tags={tags}
            triggerFirst
        />,
    );

    const editor = screen.getByRole('group', { name: 'Activity tags' });
    const trigger = within(editor).getByRole('button', { name: 'Add tag' });
    const assignedTag = within(editor).getByText('Test').closest('label');
    expect(trigger.compareDocumentPosition(assignedTag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('portals and viewport-clamps the picker outside narrow session containers', () => {
    render(
        <div data-testid="narrow-session-card">
            <ActivityTagEditor
                rootId="root"
                activityId="activity"
                instanceId="instance"
                availableTags={[]}
            />
        </div>,
    );

    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 640);
    const trigger = screen.getByRole('button', { name: 'Add tag' });
    trigger.getBoundingClientRect = () => ({ left: -40, right: 12, top: 100, bottom: 130 });
    fireEvent.click(trigger);

    const picker = screen.getByRole('dialog', { name: 'Choose activity tags' });
    expect(picker.parentElement).toBe(document.body);
    expect(picker).toHaveStyle({ position: 'fixed' });
    expect(picker.style.left).toBe('16px');
    expect(picker.style.top).toBe('136px');
    expect(picker.style.width).toBe('260px');
});
