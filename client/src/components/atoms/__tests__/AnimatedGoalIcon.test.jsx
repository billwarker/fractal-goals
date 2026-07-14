import React from 'react';
import { render } from '@testing-library/react';

import AnimatedGoalIcon from '../AnimatedGoalIcon';

describe('AnimatedGoalIcon', () => {
    it('renders a non-SMART circle as a solid primary-colour shape', () => {
        const { container } = render(
            <AnimatedGoalIcon
                shape="circle"
                color="#ff7800"
                secondaryColor="#101820"
                isSmart={false}
            />
        );

        const svg = container.querySelector('svg');
        const visibleCircles = Array.from(svg.children).filter((node) => node.tagName === 'circle');

        expect(container.querySelectorAll('ellipse')).toHaveLength(0);
        expect(visibleCircles[0]).toHaveAttribute('fill', '#ff7800');
        expect(visibleCircles.some((circle) => circle.getAttribute('fill') === '#101820')).toBe(false);
    });

    it('reserves the animated globe detailing for SMART circles', () => {
        const { container } = render(
            <AnimatedGoalIcon
                shape="circle"
                color="#ff7800"
                secondaryColor="#101820"
                isSmart={true}
            />
        );

        const svg = container.querySelector('svg');
        const visibleCircles = Array.from(svg.children).filter((node) => node.tagName === 'circle');

        expect(container.querySelectorAll('ellipse')).toHaveLength(8);
        expect(visibleCircles[0]).toHaveAttribute('fill', '#101820');
    });
});
