import { fireEvent, render, screen } from '@testing-library/react';

import SourceSelector from '../SourceSelector';

describe('SourceSelector', () => {
    it('keeps both compact source cards fully actionable', () => {
        const onSelectSource = vi.fn();
        render(<SourceSelector
            sessionSource="program"
            onSelectSource={onSelectSource}
            programName="Q4 2026"
            programColor="#22c55e"
        />);

        expect(screen.getByRole('heading', { name: 'Choose Session Source' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /From Q4 2026/ })).toHaveTextContent('Selected');
        expect(screen.getByText('Q4 2026')).toHaveStyle({ color: '#22c55e' });
        fireEvent.click(screen.getByRole('button', { name: /From Template/ }));
        expect(onSelectSource).toHaveBeenCalledWith('template');
    });
});
