import React from 'react';

import DauBarChart from './DauBarChart';
import LiveSinceNote from './LiveSinceNote';
import { FunnelTable, NamedCounts } from './usageParts';
import styles from './UsageViews.module.css';

/** Overview → Acquisition: public-site traffic, where it came from, and how it converts. */
export default function AcquisitionView({ growth, windowStart, windowEnd, webLiveSince }) {
    const { traffic, funnel } = growth;
    return (
        <div className={styles.view}>
            <h4 className={styles.subheading}>Visitors per day</h4>
            <DauBarChart
                dau={traffic.visitors_by_day}
                seriesLabel="Visitors"
                unit="visitor"
                height={160}
                compact
                ariaLabel={`Public site visitors per day from ${windowStart} to ${windowEnd}`}
            />
            <LiveSinceNote liveSince={webLiveSince} windowStart={windowStart} />
            <div className={styles.viewGrid}>
                <div>
                    <h4 className={styles.subheading}>Conversion</h4>
                    <FunnelTable funnel={funnel} />
                    <p className={styles.note}>
                        Visitors are counted per day: someone visiting on two days counts twice. Each step counts what
                        happened in the window, so people part-way through appear in the earlier steps only.
                    </p>
                </div>
                <div>
                    <NamedCounts title="Top referring sites" rows={traffic.top_referrers} empty="No referred visits yet." />
                    <NamedCounts title="Top campaigns (utm_source)" rows={traffic.top_campaigns} empty="No campaign visits yet." />
                </div>
            </div>
        </div>
    );
}
