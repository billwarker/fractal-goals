/**
 * useNotesPageQuery — hook for the /notes page.
 * Handles paginated all-notes fetching with filters, plus CRUD and pin/unpin.
 */

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

const PAGE_SIZE = 25;

function normalizeNoteFilters(filters = {}) {
    return {
        context_types: Array.isArray(filters.context_types) && filters.context_types.length
            ? [...filters.context_types].filter(Boolean).sort()
            : undefined,
        note_types: Array.isArray(filters.note_types) && filters.note_types.length
            ? [...filters.note_types].filter(Boolean).sort()
            : undefined,
        goal_id: filters.goal_id || undefined,
        activity_definition_ids: Array.isArray(filters.activity_definition_ids) && filters.activity_definition_ids.length
            ? [...filters.activity_definition_ids].filter(Boolean).sort()
            : undefined,
        activity_group_ids: Array.isArray(filters.activity_group_ids) && filters.activity_group_ids.length
            ? [...filters.activity_group_ids].filter(Boolean).sort()
            : undefined,
        pinned_only: filters.pinned_only ? true : undefined,
        search: filters.search?.trim() || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
    };
}

export function useNotesPageQuery(rootId, filters = {}) {
    const queryClient = useQueryClient();
    const normalizedFilters = useMemo(() => normalizeNoteFilters(filters), [filters]);
    const noteKey = queryKeys.allNotes(rootId, normalizedFilters);

    const {
        data,
        isLoading,
        error,
        isFetching,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: noteKey,
        queryFn: async ({ pageParam = 0 }) => {
            const res = await fractalNotesApi.getAllNotes(rootId, {
                ...normalizedFilters,
                page: pageParam,
                page_size: PAGE_SIZE,
            });
            return res.data;
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => (lastPage?.has_more ? (lastPage.page || 0) + 1 : undefined),
        enabled: !!rootId,
        staleTime: 20000,
        placeholderData: (previousData) => previousData,
    });

    const pages = data?.pages || [];
    const notes = pages.flatMap((page) => page?.notes || []);
    const total = pages[0]?.total || 0;
    const hasMore = Boolean(hasNextPage);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['all-notes', rootId] });
        queryClient.invalidateQueries({ queryKey: ['goal-notes', rootId] });
    };

    const createNoteMutation = useMutation({
        mutationFn: (noteData) => fractalNotesApi.createNote(rootId, noteData),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to create note'),
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content }) => fractalNotesApi.updateNote(rootId, noteId, { content }),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to update note'),
    });

    const deleteNoteMutation = useMutation({
        mutationFn: (note) => fractalNotesApi.deleteNote(rootId, note.id),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to delete note'),
    });

    const pinNoteMutation = useMutation({
        mutationFn: (noteId) => fractalNotesApi.pinNote(rootId, noteId),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to pin note'),
    });

    const unpinNoteMutation = useMutation({
        mutationFn: (noteId) => fractalNotesApi.unpinNote(rootId, noteId),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to unpin note'),
    });

    return {
        notes,
        total,
        hasMore,
        isLoading,
        isFetching: isFetching || isFetchingNextPage,
        error,
        loadNextPage: () => fetchNextPage(),
        createNote: (data) => createNoteMutation.mutateAsync(data),
        updateNote: (noteId, content) => updateNoteMutation.mutateAsync({ noteId, content }),
        deleteNote: (note) => deleteNoteMutation.mutateAsync(note),
        pinNote: (noteId) => pinNoteMutation.mutateAsync(noteId),
        unpinNote: (noteId) => unpinNoteMutation.mutateAsync(noteId),
    };
}
