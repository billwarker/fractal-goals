import React from 'react';
import { formatPreviewValue, getErrorMessage } from './agentChatFormatting';
import styles from './AgentChatPopover.module.css';

function AgentProposalReview({ proposal, isPending, onDecision, error }) {
    if (!proposal) return null;

    return (
        <>
            <article className={styles.proposal}>
                <div className={styles.proposalHeading}>
                    <strong>Proposal {proposal.revision}</strong>
                    <span className={styles.status}>{proposal.status.replaceAll('_', ' ')}</span>
                </div>
                {(proposal.preview || []).map((item) => (
                    <div className={styles.previewItem} key={item.operation_id}>
                        <strong>{item.action}</strong>
                        {item.name && <span>{item.name}</span>}
                        {item.deadline && <span>Due {item.deadline}</span>}
                        {item.start_date && <span>Starts {String(item.start_date).slice(0, 10)}</span>}
                        {item.end_date && <span>Ends {String(item.end_date).slice(0, 10)}</span>}
                        {item.date && <span>Date {String(item.date).slice(0, 10)}</span>}
                        {item.day_of_week?.length > 0 && <span>Repeats {item.day_of_week.join(', ')}</span>}
                        {item.templates?.length > 0 && (
                            <span>Templates: {item.templates.map((template) => template.name).join(', ')}</span>
                        )}
                        {item.changes && (
                            <dl className={styles.changeList}>
                                {Object.entries(item.changes).map(([field, value]) => (
                                    <React.Fragment key={field}>
                                        <dt>{field.replaceAll('_', ' ')}</dt>
                                        <dd>
                                            {Object.prototype.hasOwnProperty.call(item.before || {}, field) && (
                                                <span><strong>Before:</strong> {formatPreviewValue(item.before[field])}</span>
                                            )}
                                            <span><strong>Proposed:</strong> {formatPreviewValue(value)}</span>
                                        </dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        )}
                        {item.content && <p>{item.content}</p>}
                        {Array.isArray(item.before_goal_names) && (
                            <span>Goals before: {item.before_goal_names.join(', ') || 'None'}</span>
                        )}
                        {Array.isArray(item.goal_names) && (
                            <span>{item.before_goal_names ? 'Goals after' : 'Associated goals'}: {item.goal_names.join(', ') || 'None'}</span>
                        )}
                        {Array.isArray(item.before_template_names) && (
                            <span>Templates before: {item.before_template_names.join(', ') || 'None'}</span>
                        )}
                        {Array.isArray(item.template_names) && (
                            <span>Templates after: {item.template_names.join(', ') || 'None'}</span>
                        )}
                    </div>
                ))}
                {proposal.status === 'awaiting_approval' && (
                    <div className={styles.reviewActions}>
                        <button type="button" disabled={isPending} onClick={() => onDecision('reject')}>Reject</button>
                        <button type="button" disabled={isPending} onClick={() => onDecision('approve')}>Approve and run</button>
                    </div>
                )}
            </article>
            {error && <p className={styles.error} role="alert">Could not record your decision: {getErrorMessage(error)}</p>}
        </>
    );
}

export default AgentProposalReview;
