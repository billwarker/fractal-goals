import React from 'react';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../common/EmptyState';
import SelectableCard from '../common/SelectableCard';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import SessionTemplateTypePill from '../common/SessionTemplateTypePill';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import { isQuickSession } from '../../utils/sessionRuntime';
import styles from './TemplatePicker.module.css';

function TemplatePicker({ templates, selectedTemplate, rootId, onSelectTemplate }) {
    const navigate = useNavigate();

    return (
        <StepContainer>
            <StepHeader stepNumber={1} title="Select a Template" />

            {templates.length === 0 ? (
                <EmptyState
                    description="No templates available."
                    actionLabel="Create a Template"
                    onAction={() => navigate(`/${rootId}/manage-session-templates`)}
                />
            ) : (
                <div className={styles.grid}>
                    {templates.map((template) => {
                        const isSelected = selectedTemplate?.id === template.id;
                        const quickTemplate = isQuickSession(template);
                        const sectionCount = template.template_data?.sections?.length || 0;
                        const quickActivityCount = template.template_data?.activities?.length || 0;
                        const duration = template.template_data?.total_duration_minutes || 0;

                        return (
                            <SelectableCard
                                key={template.id}
                                isSelected={isSelected}
                                onClick={() => onSelectTemplate(template)}
                                className={styles.card}
                            >
                                <div className={styles.identity}>
                                    <SessionTemplateNameBadge entity={template} size="md" />
                                    <SessionTemplateTypePill entity={template} size="sm" />
                                </div>

                                <div className={styles.meta}>
                                    {quickTemplate
                                        ? `${quickActivityCount} activit${quickActivityCount === 1 ? 'y' : 'ies'}`
                                        : `${sectionCount} section${sectionCount !== 1 ? 's' : ''} • ${duration} min`}
                                </div>

                                {template.description ? (
                                    <div className={styles.description}>{template.description}</div>
                                ) : null}

                                {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
                            </SelectableCard>
                        );
                    })}
                </div>
            )}
        </StepContainer>
    );
}

export default TemplatePicker;
