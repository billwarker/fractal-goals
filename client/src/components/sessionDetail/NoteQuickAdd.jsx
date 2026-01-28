/**
 * NoteQuickAdd - Quick input for adding notes with image paste support
 * 
 * Simple text input with Enter key to submit.
 * Supports pasting images from clipboard.
 */

import React, { useState, useRef } from 'react';
import styles from './NoteQuickAdd.module.css';

function NoteQuickAdd({ onSubmit, placeholder = "Add a note..." }) {
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
        <form className="note-quick-add" onSubmit={handleSubmit}>
            {/* Image Preview */}
            {imagePreview && (
                <div className="note-image-preview-container">
                    <img
                        src={imagePreview}
                        alt="Pasted image"
                        className="note-image-preview"
                    />
                    <button
                        type="button"
                        className="note-image-remove"
                        onClick={removeImage}
                        title="Remove image"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="note-input-row">
                <textarea
                    ref={inputRef}
                    value={content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={imagePreview ? "Add a caption (optional)..." : placeholder}
                    disabled={isSubmitting}
                    className={`note-input ${styles.quickAddTextarea}`}
                    rows={1}
                />
                <button
                    type="submit"
                    disabled={(!content.trim() && !pastedImage) || isSubmitting}
                    className="note-submit-btn"
                    title="Add note (Enter, Shift+Enter for new line, Paste image with Ctrl/Cmd+V)"
                >
                    {isSubmitting ? '...' : pastedImage ? '🖼️' : '📝'}
                </button>
            </div>

            {!imagePreview && (
                <div className="note-hint">
                    Paste images with Ctrl/Cmd+V
                </div>
            )}
        </form>
    );
}

export default NoteQuickAdd;
