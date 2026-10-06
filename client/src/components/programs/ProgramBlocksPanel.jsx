import React, { useState } from 'react';
import PropTypes from 'prop-types';

import EditIcon from '../atoms/EditIcon';
import TrashIcon from '../atoms/TrashIcon';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { formatLiteralDate } from '../../utils/dateUtils';
import BlockHeaderStats from './blocks/BlockHeaderStats';
import ProgramStatusBadge from './ProgramStatusBadge';
import styles from './ProgramBlocksPanel.module.css';

const SHORT_DATE = { year: undefined, month: 'short', day: 'numeric' };

function BlockSummary({ card, readOnly, onEditBlock, onDeleteBlock }) {
    const titleId = `side-block-${card.id}`;
    const weekText = card.weekCount
        ? (card.currentWeekIndex
            ? ` · Week ${card.currentWeekIndex} of ${card.weekCount}`
            : ` · ${card.weekCount} ${card.weekCount === 1 ? 'week' : 'weeks'}`)
        : '';
    return (
        <li className={styles.block} style={{ '--block-color': card.color }}>
            <article aria-labelledby={titleId}>
                <header className={styles.blockHeader}>
                    <h3 id={titleId}>{card.name}</h3>
                    {card.status ? <ProgramStatusBadge status={card.status} /> : null}
                    {readOnly ? null : (
                        <span className={styles.blockActions}>
                            <button type="button" className={styles.iconButton} onClick={() => onEditBlock(card.block)} aria-label={`Edit ${card.name}`}>
                                <EditIcon size={13} />
                            </button>
                            <button type="button" className={`${styles.iconButton} ${styles.iconButtonDanger}`} onClick={() => onDeleteBlock(card.block)} aria-label={`Delete ${card.name}`}>
                                <TrashIcon size={13} />
                            </button>
                        </span>
                    )}
                </header>
                <p className={styles.meta}>
                    {card.startDate ? `${formatLiteralDate(card.startDate, SHORT_DATE)} – ${formatLiteralDate(card.endDate, SHORT_DATE)}` : 'Undated'}
                    {weekText}
                </p>

                <BlockHeaderStats card={card} compact />

            </article>
        </li>
    );
}

/**
 * The calendar side pane's Blocks section: each block's program days by status,
 * consistency, the program goals due in it, and its longest streak, plus edit and delete
 * controls. Program days belong to the program and are managed on the Days tab.
 */
export default function ProgramBlocksPanel({
    cards = [], loading = false, error = null, readOnly = false,
    onEditBlock, onDeleteBlock,
}) {
    const [blockToDelete, setBlockToDelete] = useState(null);

    if (error) return <p className={styles.state} role="alert">Block results could not be loaded. Try again shortly.</p>;
    if (loading && !cards.length) return <p className={styles.state} aria-busy="true">Loading blocks…</p>;
    if (!cards.length) return <p className={styles.state}>This program has no blocks yet. Use New block below, or select dates on the calendar.</p>;

    return (
        <>
            <ul className={styles.blocks} aria-label="Blocks">
                {cards.map((card) => (
                    <BlockSummary
                        key={card.id}
                        card={card}
                        readOnly={readOnly}
                        onEditBlock={onEditBlock}
                        onDeleteBlock={setBlockToDelete}
                    />
                ))}
            </ul>
            <DeleteConfirmModal
                isOpen={Boolean(blockToDelete)}
                onClose={() => setBlockToDelete(null)}
                onConfirm={() => {
                    onDeleteBlock?.(blockToDelete.id);
                    setBlockToDelete(null);
                }}
                title="Delete Block"
                message={`Are you sure you want to delete "${blockToDelete?.name}"? This action cannot be undone.`}
                requireMatchingText="delete"
            />
        </>
    );
}

ProgramBlocksPanel.propTypes = {
    cards: PropTypes.array,
    loading: PropTypes.bool,
    error: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    readOnly: PropTypes.bool,
    onEditBlock: PropTypes.func,
    onDeleteBlock: PropTypes.func,
};
