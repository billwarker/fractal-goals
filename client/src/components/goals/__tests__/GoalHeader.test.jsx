import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import GoalHeader from '../GoalHeader';

vi.mock('../../SMARTIndicator', () => ({
    default: () => <span>SMART</span>,
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'America/Toronto' }),
}));

const RENDER_OPTIONS = {
    withTheme: false,
    withAuth: false,
    withGoalLevels: false,
    withTimezone: false,
};

function renderHeader(overrides = {}) {
    return renderWithProviders(
        <GoalHeader
            mode="view"
            name="Performance Piece"
            goal={{
                attributes: {
                    name: 'Performance Piece',
                    created_at: '2026-05-01T12:00:00Z',
                    deadline: '2026-07-31',
                    type: 'ImmediateGoal',
                    ...overrides.attributes,
                },
            }}
            goalType="ImmediateGoal"
            goalColor="#ffcc00"
            textColor="#111827"
            goalStatus="active"
            {...overrides.props}
        />,
        RENDER_OPTIONS
    );
}

describe('GoalHeader', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-07T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows created, due, and age metadata without timezone-shifting date-only deadlines', () => {
        renderHeader();

        expect(screen.getByText('Created')).toBeInTheDocument();
        expect(screen.getByText('May 1, 2026')).toBeInTheDocument();
        expect(screen.getByText('Due')).toBeInTheDocument();
        // Date-only deadlines are literal calendar dates, not UTC midnights.
        expect(screen.getByText('Jul 31, 2026')).toBeInTheDocument();
        expect(screen.getByText('Age')).toBeInTheDocument();
        expect(screen.getByText('2.2m')).toBeInTheDocument();
        expect(screen.queryByText('Completed')).not.toBeInTheDocument();
        expect(screen.getByText('Due').compareDocumentPosition(screen.getByText('Age')) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
    });

    it('replaces due metadata with the completed datetime in the app timezone', () => {
        renderHeader({
            attributes: {
                completed_at: '2026-07-06T21:12:00Z',
            },
            props: {
                isCompleted: true,
            },
        });

        expect(screen.getByText('Created')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText(/Jul 6, 2026, 5:12 PM/)).toBeInTheDocument();
        expect(screen.getByText('Age')).toBeInTheDocument();
        expect(screen.queryByText('Due')).not.toBeInTheDocument();
        expect(screen.getByText('Completed').compareDocumentPosition(screen.getByText('Age')) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
    });

    it('treats backend naive completed datetimes as UTC before displaying them in the app timezone', () => {
        renderHeader({
            attributes: {
                completed_at: '2026-07-06T21:12:00',
            },
            props: {
                isCompleted: true,
            },
        });

        expect(screen.getByText(/Jul 6, 2026, 5:12 PM/)).toBeInTheDocument();
    });
});
