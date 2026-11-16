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

        expect(screen.getByRole('heading', { name: 'Choose Session Source' })).toHaveTextContent(/^1Choose Session Source/);
        expect(screen.getByRole('button', { name: /From Q4 2026/ })).toHaveTextContent('Selected');
        expect(screen.getByText('Q4 2026')).toHaveStyle({ color: '#22c55e' });
        fireEvent.click(screen.getByRole('button', { name: /From Template/ }));
        expect(onSelectSource).toHaveBeenCalledWith('template');
        fireEvent.click(screen.getByRole('button', { name: /Quick Session/ }));
        expect(onSelectSource).toHaveBeenCalledWith('quick');
    });

    it('offers templates and quick sessions without a program', () => {
        render(<SourceSelector sessionSource="quick" onSelectSource={vi.fn()} showProgram={false} />);

        expect(screen.queryByRole('button', { name: /From Active Program/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Quick Session/ })).toHaveTextContent('Selected');
        expect(screen.getByRole('button', { name: /From Template/ })).not.toHaveTextContent('Selected');
    });
});
