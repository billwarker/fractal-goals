import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import FlowTreeOptionsPane from '../FlowTreeOptionsPane';

vi.mock('../../atoms/Checkbox', () => ({
    default: ({ label, checked, onChange, className = '' }) => (
        <label className={className}>
            {label}
            <input type="checkbox" checked={checked} onChange={onChange} />
        </label>
    ),
}));

function renderPane(overrides = {}) {
    const props = {
        isMobile: false,
        isMinimized: false,
        onToggleMinimized: vi.fn(),
        goalsViewMode: 'tree',
        onGoalsViewModeChange: vi.fn(),
        viewSettings: {
            fadeInactiveBranches: false,
            hideInactiveGoals: false,
            hideCompletedGoals: false,
            showMetricsOverlay: false,
        },
        onToggleViewSetting: () => vi.fn(),
        inactiveBranchTooltip: '',
        hideInactiveTooltip: '',
        hideCompletedTooltip: '',
        isConfigureMode: true,
        onToggleConfigureMode: vi.fn(),
        onCancelConfigureMode: vi.fn(),
        onSaveSurface: vi.fn(),
        onSaveSurfaceAs: vi.fn(),
        surfaceConfigTarget: 'desktop',
        onSurfaceConfigTargetChange: vi.fn(),
        ...overrides,
    };

    render(<FlowTreeOptionsPane {...props} />);
    return props;
}

describe('FlowTreeOptionsPane surface controls', () => {
    it('uses the inline grid-control structure for the pane and option checks', () => {
        const { container } = render(<FlowTreeOptionsPane
            isMobile={false}
            isMinimized={false}
            onToggleMinimized={vi.fn()}
            goalsViewMode="tree"
            onGoalsViewModeChange={vi.fn()}
            viewSettings={{
                fadeInactiveBranches: false,
                hideInactiveGoals: false,
                hideCompletedGoals: false,
                showMetricsOverlay: false,
            }}
            onToggleViewSetting={() => vi.fn()}
            inactiveBranchTooltip=""
            hideInactiveTooltip=""
            hideCompletedTooltip=""
        />);

        expect(container.querySelector('.flowtree-options-pane')).toBeInTheDocument();
        expect(container.querySelectorAll('.flowtree-options-check')).toHaveLength(4);
        expect(screen.getByLabelText('Fade inactive branches')).toBeInTheDocument();
        expect(screen.getByLabelText('Show metrics overlay')).toBeInTheDocument();
    });

    it('shows desktop/mobile surface config targets in configure mode', () => {
        const props = renderPane();

        expect(screen.getByRole('button', { name: 'Desktop' })).toHaveClass('flowtree-surface-target-btn-active');

        fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));

        expect(props.onSurfaceConfigTargetChange).toHaveBeenCalledWith('mobile');
    });

    it('renders the live grid coordinate tracker', () => {
        renderPane({
            surfacePointerCell: {
                x: 12,
                y: 8,
                columns: 96,
                rows: 48,
                relativeX: 0.126,
                relativeY: 0.17,
                fromRight: 83,
                fromBottom: 39,
            },
        });

        expect(screen.getByText('Cell 12,8')).toBeInTheDocument();
        expect(screen.getByText('96x48')).toBeInTheDocument();
        expect(screen.getByText('13%,17%')).toBeInTheDocument();
        expect(screen.getByText('R83 B39')).toBeInTheDocument();
    });

    it('highlights the active surface view mode while configuring', () => {
        renderPane({ surfaceViewMode: 'scoped' });

        expect(screen.getByText('Editing')).toBeInTheDocument();
        expect(screen.getByText('Scoped')).toBeInTheDocument();
    });

    it('uses explicit save and cancel controls in configure mode', () => {
        const props = renderPane({ isSurfaceDirty: true });

        expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
        expect(screen.getByText('Unsaved')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(props.onSaveSurface).toHaveBeenCalledTimes(1);
        expect(props.onCancelConfigureMode).toHaveBeenCalledTimes(1);
    });

    it('shows surface selection only before entering configure mode', () => {
        const props = renderPane({
            isConfigureMode: false,
            surfaces: [{ id: 'surface-1', name: 'Studio', is_default: true }],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Configure' }));

        expect(screen.getByRole('combobox', { name: 'Surface layout' })).toBeInTheDocument();
        expect(props.onToggleConfigureMode).toHaveBeenCalledTimes(1);
    });

    it('collects save-as surface names inline', () => {
        const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => 'Browser Prompt Name');
        const props = renderPane();

        fireEvent.click(screen.getByRole('button', { name: 'Save as...' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Surface name' }), {
            target: { value: 'Practice Dashboard' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save copy' }));

        expect(promptSpy).not.toHaveBeenCalled();
        expect(props.onSaveSurfaceAs).toHaveBeenCalledWith('Practice Dashboard');
        expect(screen.queryByRole('textbox', { name: 'Surface name' })).not.toBeInTheDocument();

        promptSpy.mockRestore();
    });
});
