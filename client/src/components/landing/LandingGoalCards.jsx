import React from 'react';

export default function LandingGoalCards({ cards, activeState, onActivate, selectedGoalId, styles }) {
    const isActive = (card) => card.goal_id
        ? selectedGoalId === card.goal_id
        : Boolean(activeState[card.key]);
    return (
        <div className={styles.goalViewCards} role="group" aria-label="Goals view highlights"
            data-content-source={cards.some((card) => card.goal_id) ? 'published' : 'fallback'}>
            {cards.map((card) => (
                <button type="button"
                    className={`${styles.goalViewCard} ${isActive(card) ? styles.goalViewCardActive : ''}`}
                    aria-pressed={isActive(card)} onClick={() => onActivate(card)} key={card.key}>
                    <span className={styles.goalViewCardTitle}>{card.heading || card.title}</span>
                    <span className={styles.goalViewCardBody}>{card.body}</span>
                </button>
            ))}
        </div>
    );
}
