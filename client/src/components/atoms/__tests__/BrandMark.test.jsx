import React from 'react';
import { render, screen } from '@testing-library/react';

import BrandMark from '../BrandMark';

describe('BrandMark', () => {
    it('is decorative by default', () => {
        const { container } = render(<BrandMark size={24} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('width', '24');
        expect(container.querySelectorAll('rect')).toHaveLength(9);
    });

    it('is a named image when given a title', () => {
        render(<BrandMark title="Fractal Goals" />);
        expect(screen.getByRole('img', { name: 'Fractal Goals' })).not.toHaveAttribute('aria-hidden');
    });
});
