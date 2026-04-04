import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownNoteContent.module.css';

function MarkdownNoteContent({ content = '', className = '' }) {
    return (
        <div className={[styles.markdown, className].filter(Boolean).join(' ')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    );
}

export default MarkdownNoteContent;
