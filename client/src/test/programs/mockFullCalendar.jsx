import React from 'react';
import { vi } from 'vitest';

/**
 * FullCalendar test double for ProgramCalendarView tests. It renders one day
 * cell (2026-05-17) through the real dayCellDidMount/WillUnmount callbacks and
 * each non-background event through eventContent, and records its last props.
 *
 * Use with: vi.mock('@fullcalendar/react', () => import('../../../test/programs/mockFullCalendar'));
 */
export const mockCalendarApi = { next: vi.fn(), prev: vi.fn(), today: vi.fn() };
export const mockCalendarState = { props: null, mounts: 0 };

function recordProps(props) {
    mockCalendarState.props = props;
}

function recordMount() {
    mockCalendarState.mounts += 1;
}

const MockFullCalendar = React.forwardRef(function MockFullCalendar(props, ref) {
    const dayRef = React.useRef(null);

    React.useImperativeHandle(ref, () => ({
        getApi: () => mockCalendarApi,
    }));
    React.useLayoutEffect(() => {
        recordProps(props);
    });
    React.useEffect(() => {
        recordMount();
    }, []);

    React.useEffect(() => {
        const dayEl = dayRef.current;
        if (dayEl) props.dayCellDidMount?.({ el: dayEl });
        return () => {
            if (dayEl) props.dayCellWillUnmount?.({ el: dayEl });
        };
    }, [props]);

    return (
        <div
            data-testid="mock-calendar"
            data-height={props.height}
            data-expand-rows={String(Boolean(props.expandRows))}
            data-day-max-events={String(props.dayMaxEvents)}
            data-selectable={String(Boolean(props.selectable))}
            data-header-left={props.headerToolbar ? props.headerToolbar.left : ''}
            data-initial-view={props.initialView}
            data-initial-date={String(props.initialDate)}
        >
            {props.headerToolbar && props.headerToolbar.left.includes('contextualToday') ? (
                <button type="button" onClick={props.customButtons.contextualToday.click}>
                    Today
                </button>
            ) : null}
            <div ref={dayRef} role="gridcell" data-testid="mock-day-cell" className="fc-daygrid-day" data-date="2026-05-17">
                <div className="fc-daygrid-day-frame">
                    <button type="button" data-program-block-label="true">Stale block label</button>
                </div>
            </div>
            {props.events
                .filter((event) => event.display !== 'background')
                .map((event) => {
                    const eventInfo = { event, el: null, view: {} };
                    return (
                        <div
                            key={event.id}
                            className="fc-event"
                            onClick={(jsEvent) => props.eventClick?.({ ...eventInfo, jsEvent })}
                        >
                            {props.eventContent?.({ event })}
                        </div>
                    );
                })}
        </div>
    );
});

export default MockFullCalendar;

export function MockGoalIcon({ shape, color, secondaryColor, isSmart, size }) {
    return (
        <svg
            data-testid="calendar-goal-icon"
            data-shape={shape}
            data-color={color}
            data-secondary-color={secondaryColor}
            data-smart={String(isSmart)}
            data-size={String(size)}
        />
    );
}
