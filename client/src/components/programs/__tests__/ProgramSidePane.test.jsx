import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProgramSidePane from '../ProgramSidePane';

function renderEmptyPane(contextDate) {
    return render(
        <ProgramSidePane
            program={null}
            goals={[]}
            onCreate={() => {}}
            onCollapse={() => {}}
            view="details"
            onViewChange={() => {}}
            contextDate={contextDate}
            today="2026-09-25"
        />,
    );
}

describe('ProgramSidePane empty day actions', () => {
    it('does not offer program creation for an unscheduled past date', () => {
        renderEmptyPane('2026-08-01');

        expect(screen.queryByRole('button', { name: 'New Program' })).not.toBeInTheDocument();
    });

    it('keeps program creation available for today and future dates', () => {
        renderEmptyPane('2026-09-25');

        expect(screen.getByRole('button', { name: 'New Program' })).toBeInTheDocument();
    });

    it('no longer asks users to choose a program from the sidepane', () => {
        render(
            <ProgramSidePane
                program={null}
                goals={[]}
                onCreate={() => {}}
                onCollapse={() => {}}
                view="details"
                onViewChange={() => {}}
                contextDate="2026-08-01"
                today="2026-09-25"
            />,
        );

        expect(screen.getByText('No program is scheduled for this day.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'View Past program' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Program' })).not.toBeInTheDocument();
    });
});
