import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GoalModal from '../GoalModal';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4caf50',
        getGoalTextColor: () => '#111111',
        getGoalSecondaryColor: () => '#d7f5df',
        getGoalIcon: () => 'circle',
        getDeadlineConstraints: () => ({}),
        getLevelCharacteristics: () => ({
            description_required: false,
            default_deadline_offset_value: null,
            default_deadline_offset_unit: null,
        }),
    }),
}));

describe('GoalModal', () => {
    it('renders optional onboarding fields and submits independently editable level colors', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.25);
        const onSubmit = vi.fn();
        render(<GoalModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} parent={null} />);

        expect(screen.getByRole('radiogroup', { name: 'Goal Type' })).toBeInTheDocument();
        const ultimateOption = screen.getByRole('radio', { name: /Ultimate/ });
        expect(ultimateOption).toBeRequired();
        expect(ultimateOption).toBeChecked();
        expect(screen.getByText(/Self-actualization/)).toBeVisible();
        fireEvent.mouseEnter(screen.getByText('Long Term Goal').closest('div'));
        expect(screen.getByText(/ambitious goal well outside/)).toBeVisible();
        expect(screen.getByLabelText('Name (Required)')).toBeRequired();
        expect(screen.getByLabelText(/Description/)).not.toBeRequired();
        expect(screen.getByLabelText(/Relevance/)).not.toBeRequired();
        expect(screen.getByLabelText(/Deadline/)).not.toBeRequired();
        expect(screen.getByLabelText(/Deadline/)).toHaveValue('');
        expect(screen.queryByText('Relevance (SMART)')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'Create New Fractal' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name (Required)'), { target: { value: 'New Fractal' } });
        expect(screen.getByRole('heading', { name: 'Create: New Fractal' })).toBeInTheDocument();
        const initialStyles = {
            UltimateGoal: {
                color: screen.getByLabelText('Ultimate color').value,
                secondary_color: screen.getByLabelText('Ultimate secondary color').value,
            },
            LongTermGoal: {
                color: screen.getByLabelText('Long Term color').value,
                secondary_color: screen.getByLabelText('Long Term secondary color').value,
            },
            MidTermGoal: {
                color: screen.getByLabelText('Medium Term color').value,
                secondary_color: screen.getByLabelText('Medium Term secondary color').value,
            },
        };
        fireEvent.change(screen.getByLabelText('Ultimate color'), { target: { value: '#123456' } });
        fireEvent.click(screen.getByRole('radio', { name: /Medium Term/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Create this Fractal Goal' }));

        const payload = onSubmit.mock.calls[0][0];
        expect(payload).toEqual(expect.objectContaining({ name: 'New Fractal', type: 'MidTermGoal', deadline: null }));
        expect(payload.level_styles.UltimateGoal).toEqual(expect.objectContaining({
            color: '#123456', secondary_color: initialStyles.UltimateGoal.secondary_color,
        }));
        expect(payload.level_styles.LongTermGoal).toEqual(expect.objectContaining(initialStyles.LongTermGoal));
        expect(payload.level_styles.MidTermGoal).toEqual(expect.objectContaining(initialStyles.MidTermGoal));
        expect(Object.values(payload.level_styles).every(({ color, secondary_color: secondary }) => (
            /^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(secondary)
        ))).toBe(true);
        expect(new Set(Object.values(payload.level_styles).map(({ icon }) => icon))).toHaveLength(4);
        vi.restoreAllMocks();
    });

    it('shows secondary colors and supports visual icon selection plus icon randomization', () => {
        render(<GoalModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} parent={null} />);
        expect(screen.getByLabelText('Ultimate secondary color')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Choose Ultimate icon' }));
        expect(screen.getByRole('listbox', { name: 'Ultimate icon choices' })).toBeVisible();
        fireEvent.click(screen.getByRole('option', { name: 'Square' }));
        expect(screen.queryByRole('listbox', { name: 'Ultimate icon choices' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Randomize all goal level icons' }));
        expect(screen.getAllByRole('button', { name: /Choose .* icon/ })).toHaveLength(3);
    });

    it('omits Short Term as a root option and explains greyed-out levels above the selected root', () => {
        render(<GoalModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} parent={null} />);

        expect(screen.queryByRole('radio', { name: /Short Term/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: /Medium Term/ }));
        fireEvent.mouseEnter(screen.getByText('Ultimate Goal').closest('div'));
        expect(screen.getByText(/can't contain goal levels above its Medium Term Goal root/)).toBeVisible();

        fireEvent.mouseEnter(screen.getByText('Medium Term Goal').closest('div'));
        expect(screen.getByText(/next major challenge on the horizon/)).toBeVisible();

        fireEvent.click(screen.getByRole('radio', { name: /Ultimate/ }));
        fireEvent.mouseEnter(screen.getByText('Long Term Goal').closest('div'));
        expect(screen.getByText(/ambitious goal well outside/)).toBeVisible();
    });

    it('selects a goal type from the whole card and previews all SMART icons from the toolbar', () => {
        render(<GoalModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} parent={null} />);
        const longTermLabel = screen.getByText('Long Term Goal');
        const card = longTermLabel.closest('div');
        fireEvent.click(card);
        expect(screen.getByRole('radio', { name: /Long Term/ })).toBeChecked();
        const pathCountBeforeHover = document.querySelectorAll('svg path').length;
        const previewButton = screen.getByRole('button', { name: 'Preview SMART goal styling' });
        fireEvent.mouseEnter(previewButton);
        expect(document.querySelectorAll('svg path').length).toBeGreaterThan(pathCountBeforeHover);
    });

    it('randomizes all four level colors as valid distinct hex values', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.25);
        render(<GoalModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} parent={null} />);

        fireEvent.click(screen.getByRole('button', { name: 'Randomize all goal level colors' }));
        const colors = ['Ultimate', 'Long Term', 'Medium Term']
            .map((label) => screen.getByLabelText(`${label} color`).value);
        expect(new Set(colors)).toHaveLength(3);
        colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
        const secondaries = ['Ultimate', 'Long Term', 'Medium Term']
            .map((label) => screen.getByLabelText(`${label} secondary color`).value);
        secondaries.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
        secondaries.forEach((color) => expect(color).not.toBe('#d7f5df'));
        vi.restoreAllMocks();
    });

    it('renders through the shared modal shell for child-goal creation', () => {
        render(
            <GoalModal
                isOpen={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                parent={{ id: 'parent-1', name: 'Parent Goal', type: 'ShortTermGoal' }}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Add Immediate Goal')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });
});
