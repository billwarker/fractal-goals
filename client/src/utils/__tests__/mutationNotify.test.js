import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notify } = vi.hoisted(() => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../notify', () => ({
    default: notify,
}));

import { formatError, withNotify } from '../mutationNotify';

describe('mutationNotify', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('formatError', () => {
        it('prefers a plain response.data.error string', () => {
            expect(formatError({
                response: {
                    data: {
                        error: 'Top-level failure',
                    },
                },
            })).toBe('Top-level failure');
        });

        it('formats nested validation objects with parent deadline metadata', () => {
            expect(formatError({
                response: {
                    data: {
                        error: {
                            error: 'Child deadline cannot be later than parent deadline',
                            parent_deadline: '2026-03-20',
                        },
                    },
                },
            })).toBe('Child deadline cannot be later than parent deadline (parent deadline: 2026-03-20)');
        });

        it('flattens array validation messages', () => {
            expect(formatError({
                response: {
                    data: {
                        error: ['First failure', 'Second failure'],
                    },
                },
            })).toBe('First failure, Second failure');
        });

        it('falls back to generic Error.message', () => {
            expect(formatError(new Error('Network down'))).toBe('Network down');
        });

        it('uses the fallback message when nothing else is available', () => {
            expect(formatError({}, 'Fallback message')).toBe('Fallback message');
        });
    });

    describe('withNotify', () => {
        it('emits success toast on success', async () => {
            const mutation = withNotify(async () => ({ id: '1' }), {
                success: 'Saved',
            });

            await expect(mutation()).resolves.toEqual({ id: '1' });
            expect(notify.success).toHaveBeenCalledWith('Saved');
        });

        it('supports functional success messages and success silence', async () => {
            const loudMutation = withNotify(async (name) => ({ name }), {
                success: (result) => `Created ${result.name}`,
            });
            const silentMutation = withNotify(async () => ({ ok: true }), {
                success: null,
            });

            await loudMutation('goal');
            await silentMutation();

            expect(notify.success).toHaveBeenCalledTimes(1);
            expect(notify.success).toHaveBeenCalledWith('Created goal');
        });

        it('emits error toast and rethrows the original error', async () => {
            const error = new Error('Broken');
            const mutation = withNotify(async () => {
                throw error;
            }, {
                error: 'Save failed',
            });

            await expect(mutation()).rejects.toBe(error);
            expect(notify.error).toHaveBeenCalledWith('Save failed: Broken');
        });

        it('supports functional error messages', async () => {
            const error = new Error('Original');
            const mutation = withNotify(async () => {
                throw error;
            }, {
                error: (err) => `Custom: ${err.message}`,
            });

            await expect(mutation()).rejects.toBe(error);
            expect(notify.error).toHaveBeenCalledWith('Custom: Original');
        });

        it('still emits the main error toast when onError throws', async () => {
            const error = new Error('Exploded');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const mutation = withNotify(async () => {
                throw error;
            }, {
                error: 'Mutation failed',
                onError: () => {
                    throw new Error('Secondary failure');
                },
            });

            await expect(mutation()).rejects.toBe(error);

            expect(notify.error).toHaveBeenCalledWith('Mutation failed: Exploded');
            expect(consoleSpy).toHaveBeenCalledWith(
                'withNotify onError handler failed',
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });
    });
});
