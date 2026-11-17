import React from 'react';
import { render } from '@testing-library/react';

import AnimatedGoalIcon from '../../AnimatedGoalIcon';
import GoalIcon from '../../GoalIcon';
import { ILLUSION_SHAPE_OPTIONS, getIllusionShape } from '../illusionShapes';
import { ICON_SHAPES } from '../../../../utils/goalCharacteristics';

const PRIMARY = '#ff7800';
const SECONDARY = '#101820';
const SLUGS = ILLUSION_SHAPE_OPTIONS.map((option) => option.value);

const paintedWith = (container, colour) => Array.from(container.querySelectorAll('path'))
    .some((path) => path.getAttribute('fill') === colour || path.getAttribute('stroke') === colour);

describe('impossible-figure goal icons', () => {
    it('are offered in the shape pickers', () => {
        const offered = ICON_SHAPES.map((shape) => shape.value);
        SLUGS.forEach((slug) => expect(offered).toContain(slug));
    });

    it.each(SLUGS)('%s builds once and is shared between icons', (slug) => {
        expect(getIllusionShape(slug)).toBe(getIllusionShape(slug.toUpperCase()));
        expect(getIllusionShape(slug).nodes.length).toBeGreaterThan(0);
    });

    it.each(SLUGS)('%s renders a solid primary silhouette when not SMART', (slug) => {
        const { container } = render(<GoalIcon shape={slug} color={PRIMARY} secondaryColor={SECONDARY} />);

        expect(paintedWith(container, PRIMARY)).toBe(true);
        expect(paintedWith(container, SECONDARY)).toBe(false);
        expect(container.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    });

    it.each(SLUGS)('%s shows secondary detailing, without motion, as a static SMART icon', (slug) => {
        const { container } = render(<GoalIcon shape={slug} color={PRIMARY} secondaryColor={SECONDARY} isSmart />);

        expect(paintedWith(container, SECONDARY)).toBe(true);
        expect(container.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    });

    it.each(SLUGS)('%s loops when animated and SMART', (slug) => {
        const { container } = render(<AnimatedGoalIcon shape={slug} color={PRIMARY} secondaryColor={SECONDARY} isSmart />);

        expect(paintedWith(container, SECONDARY)).toBe(true);
        expect(container.querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0);
    });

    it('rests on the first frame when the viewer prefers reduced motion', () => {
        const original = window.matchMedia;
        window.matchMedia = (query) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            addEventListener: () => {},
            removeEventListener: () => {},
        });
        try {
            const { container } = render(<AnimatedGoalIcon shape="cube-star" color={PRIMARY} secondaryColor={SECONDARY} isSmart />);
            expect(container.querySelectorAll('animate, animateTransform')).toHaveLength(0);
            expect(paintedWith(container, SECONDARY)).toBe(true);
        } finally {
            window.matchMedia = original;
        }
    });

    it('scopes clip paths to each icon so two icons never share ids', () => {
        const { container } = render(
            <>
                <GoalIcon shape="penrose-tribar" isSmart />
                <GoalIcon shape="penrose-tribar" isSmart />
            </>
        );
        const ids = Array.from(container.querySelectorAll('clipPath')).map((clip) => clip.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('leaves unknown shapes on the existing circle', () => {
        expect(getIllusionShape('circle')).toBeNull();
        expect(getIllusionShape(undefined)).toBeNull();
    });
});
