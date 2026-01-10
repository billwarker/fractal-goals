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
        <form className="note-quick-add" onSubmit={handleSubmit}>
            <textarea
                ref={inputRef}
                value={content}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isSubmitting}
                className="note-input"
                rows={1}
                style={{
                    resize: 'none',
                    overflow: 'hidden',
                    minHeight: '38px', // Match previous input height approx
                    lineHeight: '1.4'
                }}
            />
            <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="note-submit-btn"
                title="Add note (Enter, Shift+Enter for new line)"
            >
                {isSubmitting ? '...' : '📝'}
            </button>
        </form>
    );
}

export default NoteQuickAdd;
