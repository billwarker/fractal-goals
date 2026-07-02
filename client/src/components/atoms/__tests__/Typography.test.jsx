import React from 'react';
import { render, screen } from '@testing-library/react';

import { ConfigText } from '../Typography';

describe('ConfigText', () => {
    it('renders technical configuration copy with the config text class', () => {
        render(<ConfigText>Surface target</ConfigText>);

        expect(screen.getByText('Surface target').className).toContain('configText');
    });
});
