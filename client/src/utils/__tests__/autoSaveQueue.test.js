import { createAutoSaveQueue } from '../autoSaveQueue';

describe('createAutoSaveQueue', () => {
    it('deduplicates identical payloads', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const queue = createAutoSaveQueue({ save });

        await queue.enqueue({ a: 1 });
        await queue.enqueue({ a: 1 });

        expect(save).toHaveBeenCalledTimes(1);
    });

    it('saves newest pending payload after in-flight save', async () => {
        let releaseFirst;
        const first = new Promise((resolve) => {
            releaseFirst = resolve;
        });
        const save = vi.fn()
            .mockReturnValueOnce(first)
            .mockResolvedValueOnce(undefined);

        const queue = createAutoSaveQueue({ save });

        const initialSave = queue.enqueue({ v: 1 });
        queue.enqueue({ v: 2 });

        releaseFirst();
        await initialSave;

        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[0][0]).toEqual({ v: 1 });
        expect(save.mock.calls[1][0]).toEqual({ v: 2 });
    });

    it('seed prevents re-saving identical initial payload', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const queue = createAutoSaveQueue({ save });

        queue.seed({ x: 'seeded' });
        await queue.enqueue({ x: 'seeded' });

        expect(save).not.toHaveBeenCalled();
    });
});
