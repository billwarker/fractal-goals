import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionListCard from '../SessionListCard';

const getSession = vi.fn();
vi.mock('../../../utils/api', () => ({ fractalApi: { getSession: (...args) => getSession(...args) } }));
vi.mock('../SessionCardExpanded', () => ({
    default: ({ session, detailsDeferred, detailsLoading, detailsError, onSelect, onRetryDetails }) => <div>
        <span>{session.name}:{detailsDeferred ? 'summary' : 'detail'}</span>
        <button onClick={() => onSelect(session.id)}>Expand</button>
        {detailsLoading && <span role="status">Loading details</span>}
        {detailsError && <button onClick={onRetryDetails}>Retry</button>}
    </div>,
}));

it('defers details until selection, retries a failure, and reuses cached details', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000 } } });
    getSession.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ data: { id: 's', name: 'Full session', activity_instances: [] } });
    const session = { id: 's', name: 'Summary session', read_model: 'session-list-v1' };
    const props = { session, rootId: 'r', isSelected: false, onSelect: vi.fn() };
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { rerender } = render(<SessionListCard {...props} />, { wrapper });
    expect(screen.getByText('Summary session:summary')).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
    rerender(<SessionListCard {...props} isSelected />);
    fireEvent.click(await screen.findByText('Retry'));
    expect(await screen.findByText('Full session:detail')).toBeInTheDocument();
    rerender(<SessionListCard {...props} />);
    expect(screen.getByText('Summary session:summary')).toBeInTheDocument();
    rerender(<SessionListCard {...props} isSelected />);
    await waitFor(() => expect(screen.getByText('Full session:detail')).toBeInTheDocument());
    expect(getSession).toHaveBeenCalledTimes(2);
});
