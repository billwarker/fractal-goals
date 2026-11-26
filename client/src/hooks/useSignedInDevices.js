import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { syncApi } from '../utils/api/syncApi';
import { queryKeys } from './queryKeys';

const EMPTY = [];

export function useSignedInDevices() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: queryKeys.signedInDevices(),
        queryFn: async () => (await syncApi.getDevices()).data.devices,
    });
    const signOut = useMutation({
        mutationFn: syncApi.revokeDevice,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.signedInDevices() }),
    });
    return {
        devices: query.data ?? EMPTY,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        signOut: signOut.mutateAsync,
        signingOutId: signOut.isPending ? signOut.variables : null,
    };
}
