/**
 * NoteQuickAdd - Quick input for adding notes
 * 
 * Simple text input with Enter key to submit.
 */

import React, { useState, useRef } from 'react';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note..." }) {
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef(null);

    const handleSubmit = async (e) => {
        e?.preventDefault();

        const trimmedContent = content.trim();
        if (!trimmedContent || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(trimmedContent);
            setContent('');
            // Keep focus on input for rapid note-taking
            inputRef.current?.focus();
        } catch (err) {
            // Error handling done in parent
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <form className="note-quick-add" onSubmit={handleSubmit}>
            <input
                ref={inputRef}
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isSubmitting}
                className="note-input"
                autoComplete="off"
            />
            <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="note-submit-btn"
                title="Add note (Enter)"
            >
                {isSubmitting ? '...' : '📝'}
            </button>
        </form>
    );
}

export default NoteQuickAdd;
