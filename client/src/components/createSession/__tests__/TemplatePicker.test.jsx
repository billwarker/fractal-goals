import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import TemplatePicker from '../TemplatePicker';

function renderPicker(templates, props = {}) {
    return render(
        <MemoryRouter>
            <TemplatePicker
                templates={templates}
                selectedTemplate={null}
                rootId="root-1"
                onSelectTemplate={vi.fn()}
                {...props}
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

    it('wraps long template names within their cards', () => {
        const longName = 'Solo Programming – Upper Body Day 3';
        renderPicker([
            {
                id: 'template-long-name',
                name: longName,
                template_data: { sections: [{ name: 'Main' }] },
            },
        ]);

        const badge = screen.getByTitle(longName);
        expect(badge).toContainElement(screen.getByText(longName));
        expect(badge.className).toContain('wrap');
    });

    it('pins today’s program templates and labels their rules and completion', () => {
        renderPicker([
            { id: 'other', name: 'Other', updated_at: '2026-01-03', template_data: { sections: [] } },
            { id: 'required', name: 'Program Required', updated_at: '2026-01-01', template_data: { sections: [] } },
        ], {
            programTemplateIds: new Set(['required']),
            requiredTemplateIds: new Set(['required']),
            completedTemplateIds: new Set(['required']),
            programName: 'Strength',
            programColor: '#22c55e',
        });
        expect(screen.getByRole('heading', { name: 'Today in Strength' })).toBeInTheDocument();
        expect(screen.getByText('Strength')).toHaveStyle({ color: '#22c55e' });
        expect(screen.getByText('Required')).toBeInTheDocument();
        expect(screen.getByText('Done today')).toBeInTheDocument();
        const names = screen.getAllByTitle(/Other|Program Required/).map((node) => node.title);
        expect(names).toEqual(['Program Required', 'Other']);
    });

    it('keeps the standard layout when no program templates exist', () => {
        renderPicker([{ id: 'normal', name: 'Normal', template_data: { sections: [] } }]);
        expect(screen.queryByRole('heading', { name: /Today in/ })).not.toBeInTheDocument();
        expect(screen.getByText('Normal')).toBeInTheDocument();
    });
});
