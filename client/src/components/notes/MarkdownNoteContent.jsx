import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownNoteContent.module.css';
import { markdownComponents } from './markdownComponents';

function MarkdownNoteContent({ content = '', className = '' }) {
    return (
        <div className={[styles.markdown, className].filter(Boolean).join(' ')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
            </ReactMarkdown>
        </div>
    );
}

export default MarkdownNoteContent;
