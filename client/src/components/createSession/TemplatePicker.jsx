import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../common/EmptyState';
import SelectableCard from '../common/SelectableCard';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import SessionTemplateTypePill from '../common/SessionTemplateTypePill';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import { isQuickSession } from '../../utils/sessionRuntime';
import { formatLastUsed, getAverageDurationStat, getTemplateSortTimestamp } from '../../utils/durationStats';
import styles from './TemplatePicker.module.css';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';

const STARTER_TEMPLATE = {
    name: 'Simple Empty Template',
    description: 'A blank one-section session. Start here, add activities as you go.',
    template_data: {
        session_type: 'normal',
        sections: [{ name: 'Main', activities: [] }],
    },
};

function StarterTemplateEmptyState({ rootId, onSelectTemplate }) {
    const queryClient = useQueryClient();
    const createStarterTemplate = useMutation({
        mutationFn: async () => {
            const response = await fractalApi.createSessionTemplate(rootId, STARTER_TEMPLATE);
            return response.data;
        },
        onSuccess: (template) => {
            queryClient.setQueryData(queryKeys.sessionTemplates(rootId), (current = []) => [
                ...current,
                template,
            ]);
            onSelectTemplate(template);
            notify.success('Starter template created');
        },
        onError: (error) => notify.error(`Failed to create starter template: ${formatError(error)}`),
    });

    return (
        <EmptyState
            description="Sessions need a template. Start with a blank section and add activities when you are ready."
            actionLabel={createStarterTemplate.isPending ? 'Creating…' : 'Create a starter template'}
            onAction={() => createStarterTemplate.mutate()}
        />
    );
}

function TemplatePicker({ templates, selectedTemplate, rootId, onSelectTemplate }) {
    const navigate = useNavigate();
    const [showArchived, setShowArchived] = useState(false);
    const orderedTemplates = [...templates].sort((a, b) => (
        getTemplateSortTimestamp(b).localeCompare(getTemplateSortTimestamp(a))
    ));
    const activeTemplates = orderedTemplates.filter((template) => !template.is_archived || template.is_used_in_active_program);
    const archivedTemplates = orderedTemplates.filter((template) => template.is_archived && !template.is_used_in_active_program);

    const renderTemplateCards = (items) => items.map((template) => {
        const isSelected = selectedTemplate?.id === template.id;
        const quickTemplate = isQuickSession(template);
        const sectionCount = template.template_data?.sections?.length || 0;
        const quickActivityCount = template.template_data?.activities?.length || 0;
        const averageDuration = getAverageDurationStat(template.stats);
        const lastUsedLabel = formatLastUsed(template.stats?.last_used_at);
        const structureLabel = quickTemplate
            ? `${quickActivityCount} activit${quickActivityCount === 1 ? 'y' : 'ies'}`
            : `${sectionCount} section${sectionCount !== 1 ? 's' : ''}`;
        const metaParts = [
            structureLabel,
            averageDuration ? `Avg ${averageDuration.label}` : null,
            lastUsedLabel,
        ].filter(Boolean);

        return (
            <SelectableCard
                key={template.id}
                isSelected={isSelected}
                onClick={() => onSelectTemplate(template)}
                className={styles.card}
            >
                <div className={styles.identity}>
                    <SessionTemplateNameBadge entity={template} size="md" />
                    <div className={styles.pillRow}>
                        <SessionTemplateTypePill entity={template} size="sm" />
                        {template.is_archived ? <span className={styles.statusPill}>Archived</span> : null}
                        {template.is_used_in_active_program ? <span className={styles.activeProgramPill}>Active Program</span> : null}
                    </div>
                </div>

                <div
                    className={styles.meta}
                    title={averageDuration ? `Average based on ${averageDuration.sampleCount} completed sessions` : undefined}
                >
                    {metaParts.join(' • ')}
                </div>

                {template.description ? (
                    <div className={styles.description}>{template.description}</div>
                ) : null}

                {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
            </SelectableCard>
        );
    });

    return (
        <StepContainer>
            <StepHeader stepNumber={1} title="Select a Template" />

            {templates.length === 0 ? (
                <StarterTemplateEmptyState rootId={rootId} onSelectTemplate={onSelectTemplate} />
            ) : (
                <div className={styles.templateSections}>
                    {activeTemplates.length > 0 ? (
                        <div className={styles.grid}>
                            {renderTemplateCards(activeTemplates)}
                        </div>
                    ) : (
                        <EmptyState
                            description="No active templates available."
                            actionLabel="Manage Templates"
                            onAction={() => navigate(`/${rootId}/manage-session-templates`)}
                        />
                    )}

                    {archivedTemplates.length > 0 && (
                        <div className={styles.archivedSection}>
                            <button
                                type="button"
                                className={styles.archivedToggle}
                                onClick={() => setShowArchived((value) => !value)}
                                aria-expanded={showArchived}
                            >
                                {showArchived ? 'Hide' : 'Show'} Archived ({archivedTemplates.length})
                            </button>
                            {showArchived && (
                                <div className={styles.grid}>
                                    {renderTemplateCards(archivedTemplates)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </StepContainer>
    );
}

export default TemplatePicker;
