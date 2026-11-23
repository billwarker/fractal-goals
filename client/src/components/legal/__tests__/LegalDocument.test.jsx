import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LegalDocument from '../LegalDocument';
import { PRIVACY_DOCUMENT, TERMS_DOCUMENT, LEGAL_DOCUMENTS } from '../../../content/legal/legalContent';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../../content/legal/legalVersions';

describe('legal documents', () => {
  it('parses version and effective date from the markdown header', () => {
    expect(PRIVACY_DOCUMENT.version).toBe('1.4');
    expect(PRIVACY_DOCUMENT.effective).toBe('2026-11-22');
    expect(TERMS_DOCUMENT.version).toBe('1.1');
  });

  it('strips the metadata comment from the rendered body', () => {
    expect(PRIVACY_DOCUMENT.body).not.toContain('<!--');
    expect(TERMS_DOCUMENT.body).not.toContain('version:');
    expect(PRIVACY_DOCUMENT.body.startsWith('# Privacy Policy')).toBe(true);
  });

  it('renders the privacy policy with headings and tables', () => {
    render(<LegalDocument document={PRIVACY_DOCUMENT} />);
    expect(screen.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Information we collect/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(3);
    expect(screen.getByText(/Version 1.4 . Effective November 22, 2026/)).toBeInTheDocument();
  });

  it('renders the terms with the key liability sections', () => {
    render(<LegalDocument document={TERMS_DOCUMENT} />);
    expect(screen.getByRole('heading', { name: /Limitation of liability/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Not medical, health, or fitness advice/i })).toBeInTheDocument();
    expect(screen.getByText(/no mandatory arbitration clause/i)).toBeInTheDocument();
  });

  it('has no unfilled placeholders', () => {
    const combined = PRIVACY_DOCUMENT.body + TERMS_DOCUMENT.body;
    const placeholders = [...combined.matchAll(/\[([A-Z][A-Z \-—]+)\]/g)].map((m) => m[1]);
    expect(placeholders).toEqual([]);
  });

  it('keeps the standalone consent versions in sync with the documents', () => {
    // legalVersions.js is imported by AuthProvider to keep the markdown out of
    // the public landing bundle; if it drifts, signup records a wrong version.
    expect(TERMS_VERSION).toBe(TERMS_DOCUMENT.version);
    expect(PRIVACY_VERSION).toBe(PRIVACY_DOCUMENT.version);
  });

  it('exposes terms first so signup links to the contract', () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.id)).toEqual(['terms', 'privacy']);
  });
});
