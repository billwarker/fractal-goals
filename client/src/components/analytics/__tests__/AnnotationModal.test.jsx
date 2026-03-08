import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AnnotationModal from '../AnnotationModal';

describe('AnnotationModal', () => {
    it('keeps local draft edits until close, then rehydrates from the latest initial content', () => {
        const onClose = vi.fn();

        const { rerender } = render(
            <AnnotationModal
                isOpen={true}
                onClose={onClose}
                onSave={vi.fn()}
                initialContent="Initial note"
                selectedPoints={['2026-03-01']}
            />
        );

        const textarea = screen.getByPlaceholderText('Add your insight or note about this data...');
        expect(textarea).toHaveValue('Initial note');

        fireEvent.change(textarea, { target: { value: 'Draft note' } });
        expect(textarea).toHaveValue('Draft note');

        rerender(
            <AnnotationModal
                isOpen={true}
                onClose={onClose}
                onSave={vi.fn()}
                initialContent="Replacement note"
                selectedPoints={['2026-03-02']}
            />
        );

        expect(screen.getByPlaceholderText('Add your insight or note about this data...')).toHaveValue('Draft note');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalled();

        rerender(
            <AnnotationModal
                isOpen={true}
                onClose={onClose}
                onSave={vi.fn()}
                initialContent="Replacement note"
                selectedPoints={['2026-03-02']}
            />
        );

        expect(screen.getByPlaceholderText('Add your insight or note about this data...')).toHaveValue('Replacement note');
    });
});
