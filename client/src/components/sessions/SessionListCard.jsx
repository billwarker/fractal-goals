import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import SessionCardExpanded from './SessionCardExpanded';

export default function SessionListCard(props) {
    const { session, rootId, isSelected } = props;
    const deferred = session.read_model === 'session-list-v1';
    const detail = useQuery({
        queryKey: queryKeys.session(rootId, session.id),
        queryFn: async () => (await fractalApi.getSession(rootId, session.id)).data,
        enabled: Boolean(deferred && isSelected),
    });
    const record = deferred && isSelected && detail.data ? detail.data : session;
    return <SessionCardExpanded
        {...props}
        session={record}
        sessionActivityInstances={record.activity_instances || []}
        detailsDeferred={deferred && !(isSelected && detail.data)}
        detailsLoading={isSelected && detail.isLoading}
        detailsError={isSelected ? detail.error : null}
        onRetryDetails={() => detail.refetch()}
    />;
}
