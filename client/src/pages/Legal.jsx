import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import LegalDocument from '../components/legal/LegalDocument';
import { LEGAL_DOCUMENTS, getLegalDocument } from '../content/legal/legalContent';
import styles from './Legal.module.css';

/**
 * Public, unauthenticated view of a legal document.
 *
 * These routes must render for signed-out visitors: the signup consent
 * checkbox links here before an account exists, and the landing footer links
 * here from the marketing host.
 */
export default function Legal() {
    const location = useLocation();
    const documentId = location.pathname.replace(/^\/+|\/+$/g, '') || 'terms';
    const activeDocument = getLegalDocument(documentId);

    if (!activeDocument) return null;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <a href="/" className={styles.brand}>Fractal Goals</a>
                <nav className={styles.nav} aria-label="Legal documents">
                    {LEGAL_DOCUMENTS.map((document) => (
                        <Link
                            key={document.id}
                            to={document.path}
                            className={styles.navLink}
                            aria-current={document.id === activeDocument.id ? 'page' : undefined}
                        >
                            {document.title}
                        </Link>
                    ))}
                </nav>
            </header>

            <main className={styles.main}>
                <LegalDocument document={activeDocument} />
            </main>
        </div>
    );
}
