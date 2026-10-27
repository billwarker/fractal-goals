/**
 * useNotesPageQuery — hook for the /notes page.
 * Handles paginated all-notes fetching with filters, plus CRUD and pin/unpin.
 */

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalNotesApi } from '../utils/api/fractalNotesApi';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

const PAGE_SIZE = 25;

const sortedList = (values) => (Array.isArray(values) && values.length ? [...values].filter(Boolean).sort() : undefined);

/** Canonical feed parameters, so equal filters share one query key. */
export function normalizeNoteFilters(filters = {}) {
    const text = filters.text?.trim() || undefined;
    return {
        context_types: sortedList(filters.context_types),
        context_id: filters.context_id || undefined,
        text,
        categories: sortedList(filters.categories),
        goal_ids: sortedList(filters.goal_ids),
        activity_definition_ids: sortedList(filters.activity_definition_ids),
        activity_group_ids: sortedList(filters.activity_group_ids),
        pinned_only: filters.pinned_only ? true : undefined,
        saved_filter_ids: sortedList(filters.saved_filter_ids),
        day: filters.day || undefined,
        timezone: filters.timezone || undefined,
    };
}

/** Matching notes per local day for the Notes page heatmap (day selection excluded). */
export function useNotesHeatmap(rootId, filters = {}) {
    const params = useMemo(() => ({ ...normalizeNoteFilters(filters), day: undefined }), [filters]);
    return useQuery({
        queryKey: queryKeys.notesHeatmap(rootId, params),
        queryFn: async () => (await fractalNotesApi.getNotesHeatmap(rootId, params)).data,
        enabled: Boolean(rootId),
        staleTime: 20000,
        placeholderData: (previous) => previous,
        retry: false,
    });
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
        retry: false,
    });

    const pages = data?.pages || [];
    const notes = pages.flatMap((page) => page?.notes || []);
    const total = pages[0]?.total || 0;
    const hasMore = Boolean(hasNextPage);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.allNotesRoot(rootId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.goalNotesRoot(rootId) });
    };

    const createNoteMutation = useMutation({
        mutationFn: (noteData) => fractalNotesApi.createNote(rootId, noteData),
        onSuccess: () => { invalidate(); },
        onError: () => notify.error('Failed to create note'),
    });

    const updateNoteMutation = useMutation({
        mutationFn: ({ noteId, content, attachments }) => fractalNotesApi.updateNote(rootId, noteId, { content, ...(attachments ? { attachments } : {}) }),
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
        updateNote: (noteId, content, attachments) => updateNoteMutation.mutateAsync({ noteId, content, attachments }),
        deleteNote: (note) => deleteNoteMutation.mutateAsync(note),
        pinNote: (noteId) => pinNoteMutation.mutateAsync(noteId),
        unpinNote: (noteId) => unpinNoteMutation.mutateAsync(noteId),
    };
}
