import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalDetailModalPortal from '../GoalDetailModalPortal';

describe('GoalDetailModalPortal', () => {
    it('mounts modal content inside an optional scoped host', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);

        const view = render(
            <GoalDetailModalPortal portalTarget={host}>
                <div>Scoped goal details</div>
            </GoalDetailModalPortal>
        );

        expect(host).toContainElement(screen.getByText('Scoped goal details'));
        view.unmount();
        host.remove();
    });
});
