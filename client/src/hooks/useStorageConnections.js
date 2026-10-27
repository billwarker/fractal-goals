import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { storageApi } from '../utils/api/storageApi';
import { STORAGE_CHANNEL, connectionResult } from '../utils/storageConnectionCopy';
import { queryKeys } from './queryKeys';

// Read models that serialize note attachments and their availability. Disconnecting is
// account-wide, so each root is invalidated for every fractal.
const ATTACHMENT_READ_MODEL_ROOTS = [
    'all-notes', 'goal-notes', 'session-notes', 'previous-session-notes', 'activity-definition-notes', 'goalTimeline',
    'goal-attachments',
];

function invalidateAttachmentReadModels(client) {
    ATTACHMENT_READ_MODEL_ROOTS.forEach((root) => { void client.invalidateQueries({ queryKey: [root] }); });
}

export function useStorageConnections() {
    const client = useQueryClient();
    const [lastResult, setLastResult] = useState(null);
    const query = useQuery({
        queryKey: queryKeys.storageConnections(),
        queryFn: async () => (await storageApi.connections()).data,
        staleTime: 30000,
        refetchOnWindowFocus: true,
    });
    const { refetch } = query;

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(STORAGE_CHANNEL);
        channel.onmessage = ({ data }) => {
            if (data?.type !== 'storage-connection') return;
            setLastResult(connectionResult(data.provider, data.result));
            void refetch();
            if (data.result === 'connected') invalidateAttachmentReadModels(client);
        };
        return () => channel.close();
    }, [client, refetch]);

    const disconnect = useMutation({
        mutationFn: storageApi.disconnect,
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.storageConnections() });
            invalidateAttachmentReadModels(client);
        },
    });

    const uploadDestination = useMutation({
        mutationFn: storageApi.setUploadDestination,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.storageConnections() }),
    });

    /** Opens provider consent in a new window. Must be called synchronously from a click. */
    const connect = async (provider) => {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw new Error('Allow the connection window to open, then try again.');
        popup.opener = null;
        try {
            popup.location.href = (await storageApi.connect(provider)).data.url;
        } catch (failure) {
            popup.close();
            throw failure;
        }
    };

    return {
        ...query,
        providers: query.data?.providers || [],
        limits: query.data?.limits || null,
        uploadDestination: query.data?.upload_destination || null,
        setUploadDestination: uploadDestination.mutateAsync,
        isSavingDestination: uploadDestination.isPending,
        /** Refresh every note read model that shows attachments (after a rename or delete). */
        invalidateAttachments: () => invalidateAttachmentReadModels(client),
        connect,
        disconnect: disconnect.mutateAsync,
        isDisconnecting: disconnect.isPending,
        lastResult,
        clearLastResult: () => setLastResult(null),
    };
}
