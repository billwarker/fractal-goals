/**
 * NoteQuickAdd - Quick input for adding notes with image paste support
 * 
 * Simple text input with Enter key to submit.
 * Supports pasting images from clipboard.
 */

import React, { useState, useRef } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './NoteQuickAdd.module.css';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note...", isNanoMode = false, hasMicroGoal = false, onToggleNanoMode }) {
    const { getGoalColor, getGoalSecondaryColor, getLevelByName } = useGoalLevels();
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pastedImage, setPastedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
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

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64Data = event.target.result;
                        setPastedImage(base64Data);
                        setImagePreview(base64Data);
                    };
                    reader.readAsDataURL(file);
                }
                break;
            }
        }
    };

    const removeImage = () => {
        setPastedImage(null);
        setImagePreview(null);
    };

    // Reset height on submit
    const handleSubmit = async (e) => {
        e?.preventDefault();

        const trimmedContent = content.trim();
        if ((!trimmedContent && !pastedImage) || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(trimmedContent, pastedImage);
            setContent('');
            setPastedImage(null);
            setImagePreview(null);
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
            {/* Image Preview */}
            {imagePreview && (
                <div className={styles.noteImagePreviewContainer}>
                    <img
                        src={imagePreview}
                        alt="Pasted image"
                        className={styles.noteImagePreview}
                    />
                    <button
                        type="button"
                        className={styles.noteImageRemove}
                        onClick={removeImage}
                        title="Remove image"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className={styles.noteInputRow}>
                {hasMicroGoal && (
                    <button
                        type="button"
                        className={`${styles.nanoToggleBtn} ${isNanoMode ? styles.nanoModeActive : ''}`}
                        onClick={onToggleNanoMode}
                        title={isNanoMode ? "Switch to regular note" : "Create as Nano Goal"}
                    >
                        <GoalIcon
                            shape={getLevelByName('NanoGoal')?.icon || 'circle'}
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
                    onPaste={handlePaste}
                    placeholder={imagePreview ? "Add a caption (optional)..." : placeholder}
                    disabled={isSubmitting}
                    className={`${styles.quickAddTextarea} ${isNanoMode ? styles.nanoModeInput : ''}`}
                    rows={1}
                />
                <button
                    type="submit"
                    disabled={(!content.trim() && !pastedImage) || isSubmitting}
                    className={styles.noteSubmitBtn}
                    title="Add note (Enter, Shift+Enter for new line, Paste image with Ctrl/Cmd+V)"
                >
                    {isSubmitting ? '...' : pastedImage ? '🖼️' : '📝'}
                </button>
            </div>

            {!imagePreview && (
                <div className={styles.noteHint}>
                    Paste images with Ctrl/Cmd+V
                </div>
            )}
        </form>
    );
}

export default NoteQuickAdd;
