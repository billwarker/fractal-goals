import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useGoalForm } from '../useGoalForm';

const goal = (name, updated) => ({ id: 'g1', name, description: 'D', attributes: { id: 'g1', updated_at: updated } });

describe('editing a goal while another device changes it', () => {
    const setup = () => renderHook(({ current }) => useGoalForm(current, 'edit'), { initialProps: { current: goal('Old', '1') } });

    it('keeps what is being typed, and what the edit started from', () => {
        const { result, rerender } = setup();
        act(() => result.current.setDescription('Typing'));
        rerender({ current: goal('From Mac', '2') });
        expect(result.current.description).toBe('Typing');
        expect(result.current.name).toBe('Old');
        expect(result.current.startingValues).toMatchObject({ name: 'Old', description: 'D' });
    });

    it('shows the newest version when nothing has been typed, and after the edit ends', () => {
        const { result, rerender } = setup();
        rerender({ current: goal('From Mac', '2') });
        expect(result.current.name).toBe('From Mac');
        act(() => result.current.setName('Mine'));
        act(() => result.current.resetForm());
        expect(result.current.name).toBe('From Mac');
        rerender({ current: goal('Later', '3') });
        expect(result.current.name).toBe('Later');
    });

    it('starts afresh on another goal', () => {
        const { result, rerender } = setup();
        act(() => result.current.setName('Mine'));
        rerender({ current: { id: 'g2', name: 'Other', attributes: { id: 'g2', updated_at: '1' } } });
        expect(result.current.name).toBe('Other');
    });
});
