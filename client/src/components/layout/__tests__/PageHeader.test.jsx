import React from 'react';
import { render, screen } from '@testing-library/react';

import PageHeader from '../PageHeader';

const isMobileMock = vi.fn();

vi.mock('../../../hooks/useIsMobile', () => ({
    default: () => isMobileMock(),
}));

describe('PageHeader', () => {
    beforeEach(() => {
        isMobileMock.mockReturnValue(false);
    });

    it('keeps actions on one row on desktop only when asked', () => {
        const { rerender } = render(<PageHeader title="Program" actions={<button type="button">Options</button>} />);
        const actions = () => screen.getByRole('button', { name: 'Options' }).parentElement;
        expect(actions().className).not.toMatch(/headerActionsSingleRow/);

        rerender(<PageHeader title="Program" singleRowActions actions={<button type="button">Options</button>} />);
        expect(actions().className).toMatch(/headerActionsSingleRow/);

        isMobileMock.mockReturnValue(true);
        rerender(<PageHeader title="Program" singleRowActions actions={<button type="button">Options</button>} />);
        expect(actions().className).not.toMatch(/headerActionsSingleRow/);
    });

    it('renders the header copy on desktop', () => {
        render(<PageHeader title="Notes" subtitle="72 notes" actions={<button type="button">Write</button>} />);

        expect(screen.getByText('Notes')).toBeInTheDocument();
        expect(screen.getByText('72 notes')).toBeInTheDocument();
    });

    it('hides the header copy on mobile by default', () => {
        isMobileMock.mockReturnValue(true);

        render(<PageHeader title="Notes" subtitle="72 notes" actions={<button type="button">Write</button>} />);

        expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
        expect(screen.getByText('72 notes')).toBeInTheDocument();
        expect(screen.getByText('Write')).toBeInTheDocument();
    });
});
