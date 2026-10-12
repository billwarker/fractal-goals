import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import ProgramDaysView from '../../components/programs/days/ProgramDaysView';
import useProgramDaysTab from '../../hooks/useProgramDaysTab';
import { bench, program } from './programDaysFixtures';

/** The page's Days tab: the side-pane navigator (with date rails) beside the main columns. */
function Harness({ timezone = 'UTC', showDayHeading = false, onEditDay = vi.fn() }) {
    const tab = useProgramDaysTab({
        rootId: 'root',
        program,
        today: '2026-10-01',
        timezone,
        enabled: true,
        setViewMode: () => {},
        onLeavePane: () => {},
        onEditDay,
    });
    return (
        <>
            <aside aria-label="Program side pane">{tab.navigator}</aside>
            <ProgramDaysView
                rootId="root"
                program={program}
                activities={[bench]}
                activityGroups={[]}
                today="2026-10-01"
                timezone={timezone}
                resolved={tab.resolved}
                occurrencesQuery={tab.occurrencesQuery}
                focusTemplateId={tab.selection?.templateId || null}
                onSelectionChange={tab.setSelection}
                onEditDay={onEditDay}
                showDayHeading={showDayHeading}
            />
        </>
    );
}

export const pane = () => screen.getByRole('complementary', { name: 'Program side pane' });

export function renderViewWithClient({ compare = false, ...props } = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Harness {...props} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    if (compare) fireEvent.click(within(pane()).getByRole('button', { name: 'Compare two days' }));
    return { queryClient };
}

export const renderView = (props = {}) => renderViewWithClient(props);

export const nextCard = () => screen.findByRole('article', { name: 'Bench Day plan, Mon, Oct 5' });
