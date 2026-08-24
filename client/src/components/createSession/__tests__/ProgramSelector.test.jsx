import { fireEvent, render, screen } from '@testing-library/react';

import ProgramSelector from '../ProgramSelector';

describe('ProgramSelector', () => {
    it('keeps same-named programs as distinct selectable cards', () => {
        const onSelectProgram = vi.fn();
        render(<ProgramSelector
            programsById={{
                one: { program_id: 'one', program_name: 'Strength', program_color: '#22c55e', days: [{}] },
                two: { program_id: 'two', program_name: 'Strength', program_color: '#f97316', days: [{}, {}] },
            }}
            selectedProgramId="one"
            onSelectProgram={onSelectProgram}
            hasTemplates={false}
        />);
        const programNames = screen.getAllByText('Strength');
        expect(programNames).toHaveLength(2);
        expect(programNames[0]).toHaveStyle({ color: '#22c55e' });
        expect(programNames[1]).toHaveStyle({ color: '#f97316' });
        fireEvent.click(screen.getByText('2 active days available'));
        expect(onSelectProgram).toHaveBeenCalledWith('two');
    });
});
