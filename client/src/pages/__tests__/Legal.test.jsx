import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Legal from '../Legal';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Legal />
    </MemoryRouter>
  );
}

describe('public Legal route', () => {
  it('renders the privacy policy at /privacy', () => {
    renderAt('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeInTheDocument();
    expect(screen.getByText(/We do not store your IP address/i)).toBeInTheDocument();
  });

  it('renders the terms at /terms', () => {
    renderAt('/terms');
    expect(screen.getByRole('heading', { level: 1, name: /Terms of Service/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Limitation of liability/i })).toBeInTheDocument();
  });

  it('marks the current document in the nav and links to the other', () => {
    renderAt('/terms');
    const nav = screen.getByRole('navigation', { name: 'Legal documents' });
    const current = within(nav).getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('Terms of Service');
  });
});
