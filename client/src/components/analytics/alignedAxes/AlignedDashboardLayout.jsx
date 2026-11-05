import React from 'react';

import ProfileWindowLayout from '../ProfileWindowLayout';
import { AlignedAxesProvider } from './AlignedAxesContext';

/** The dashboard grid, with matching axes lined up across its panels. */
export default function AlignedDashboardLayout({ alignAxes = true, ...props }) {
    return (
        <AlignedAxesProvider layout={props.layout} enabled={alignAxes}>
            <ProfileWindowLayout {...props} />
        </AlignedAxesProvider>
    );
}
