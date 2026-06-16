import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import TemplatePicker from '../TemplatePicker';

function renderPicker(templates) {
    return render(
        <MemoryRouter>
            <TemplatePicker
                templates={templates}
                selectedTemplate={null}
                rootId="root-1"
                onSelectTemplate={vi.fn()}
            />
        </MemoryRouter>
    );
}

describe('TemplatePicker', () => {
    it('hides archived templates behind a collapsed archived section', () => {
        renderPicker([
            {
                id: 'template-active',
                name: 'Active Flow',
                template_data: { sections: [{ name: 'Main' }] },
                is_archived: false,
            },
            {
                id: 'template-archived',
                name: 'Old Flow',
                template_data: { sections: [{ name: 'Old' }] },
                is_archived: true,
            },
        ]);

        expect(screen.getByText('Active Flow')).toBeInTheDocument();
        expect(screen.queryByText('Old Flow')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show Archived (1)' }));

        expect(screen.getByText('Old Flow')).toBeInTheDocument();
    });

    it('keeps archived templates visible when used by an active program', () => {
        renderPicker([
            {
                id: 'template-program',
                name: 'Program Flow',
                template_data: { sections: [{ name: 'Main' }] },
                is_archived: true,
                is_used_in_active_program: true,
            },
        ]);

        expect(screen.getByText('Program Flow')).toBeInTheDocument();
        expect(screen.getByText('Active Program')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Show Archived/ })).not.toBeInTheDocument();
    });
});
