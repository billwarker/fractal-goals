/**
 * NoteQuickAdd - Quick input for adding notes
 * 
 * Simple text input with Enter key to submit.
 */

import React, { useState, useRef } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './NoteQuickAdd.module.css';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note...", isNanoMode = false, hasMicroGoal = false, onToggleNanoMode }) {
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const nanoColor = getGoalColor('NanoGoal');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef(null);

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    const handleChange = (e) => {
        setContent(e.target.value);
        adjustHeight(e.target);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Reset height on submit
    const handleSubmit = async (e) => {
        e?.preventDefault();

        const trimmedContent = content.trim();
        if (!trimmedContent || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(trimmedContent);
            setContent('');
            if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.focus();
            }
        } catch (err) {
            // Error handling done in parent
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form className={styles.noteQuickAdd} onSubmit={handleSubmit}>
            <div className={styles.noteInputRow}>
                {hasMicroGoal && (
                    <button
                        type="button"
                        className={`${styles.nanoToggleBtn} ${isNanoMode ? styles.nanoModeActive : ''}`}
                        onClick={onToggleNanoMode}
                        title={isNanoMode ? "Switch to regular note" : "Create as Nano Goal"}
                    >
                        <GoalIcon
                            shape={getGoalIcon('NanoGoal')}
                            color={isNanoMode ? getGoalColor('NanoGoal') : 'var(--color-text-muted)'}
                            size={18}
                        />
                    </button>
                )}
                <textarea
                    ref={inputRef}
                    value={content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={isSubmitting}
                    className={`${styles.quickAddTextarea} ${isNanoMode ? styles.nanoModeInput : ''}`}
                    rows={1}
                    style={isNanoMode ? { '--nano-goal-color': nanoColor, fontStyle: 'italic' } : undefined}
                />
                <button
                    type="submit"
                    disabled={!content.trim() || isSubmitting}
                    className={styles.noteSubmitBtn}
                    title="Add note (Enter, Shift+Enter for new line)"
                >
                    {isSubmitting ? '...' : '📝'}
                </button>
            </div>

            <div className={styles.noteHint}>
                Markdown supported. Press Enter to save, Shift+Enter for a new line.
            </div>
        </form>
    );
}

export default NoteQuickAdd;
