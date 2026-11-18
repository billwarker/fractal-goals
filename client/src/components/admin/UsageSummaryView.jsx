import React from 'react';

import DauBarChart from './DauBarChart';
import { FunnelTable, KpiStrip, SectionHeader, percent, wapSeries, weekChange } from './usageParts';
import styles from './UsageViews.module.css';

const FUNNEL_PREVIEW_STEPS = 4;

function growthKpis({ traffic, funnel, wap }) {
    const first = funnel[0]?.count || 0;
    const signedUp = funnel.find((step) => step.key === 'signed_up')?.count || 0;
    return [
        { label: 'Weekly active practitioners', value: wap.current.count, detail: weekChange(wap.current.count, wap.previous.count) },
        { label: 'Practising this week', value: percent(wap.current.count, wap.current.accounts), detail: `of ${wap.current.accounts} accounts` },
        { label: 'Visitors in window', value: traffic.visitor_days, detail: `${traffic.demo_starts} demo starts` },
        { label: 'Visitor → sign-up', value: percent(signedUp, first), detail: `${signedUp} signed up` },
    ];
}

function GrowthPreview({ growth: { funnel, wap }, onOpen }) {
    return (
        <div className={styles.viewGrid}>
            <div>
                <SectionHeader title="Weekly active practitioners" onOpen={() => onOpen('engagement')} openLabel="Open Engagement" />
                <DauBarChart
                    dau={wapSeries(wap)}
                    seriesLabel="Practitioners"
                    unit="practitioner"
                    xTitle="Week of"
                    height={160}
                    compact
                    ariaLabel={`Weekly active practitioners for the ${wap.weeks.length} weeks to ${wap.current.week_start}`}
                />
            </div>
            <div>
                <SectionHeader title="Conversion" onOpen={() => onOpen('acquisition')} openLabel="Open Acquisition" />
                <FunnelTable funnel={funnel.slice(0, FUNNEL_PREVIEW_STEPS)} />
            </div>
        </div>
    );
}

/**
 * Overview → Summary: the headline numbers, the weekly KPI and the top of the funnel,
 * each linking to the tab with the detail, then the account totals.
 */
export default function UsageSummaryView({ data, accountCards = [], onOpen }) {
    const growth = data.growth;
    const pageViews = (data.top_events || []).find((event) => event.event_name === 'page_view')?.count ?? 0;
    const signups = (data.signups_by_day || []).reduce((total, day) => total + day.count, 0);

    return (
        <div className={styles.view}>
            <KpiStrip
                label="Headline numbers"
                items={[
                    ...(growth ? growthKpis(growth) : []),
                    { label: 'Active last 7 days', value: data.active_users?.wau ?? 0 },
                    { label: 'Active last 30 days', value: data.active_users?.mau ?? 0 },
                    { label: 'Signups in window', value: signups },
                    { label: 'Page views in window', value: pageViews },
                ]}
            />
            {growth && <GrowthPreview growth={growth} onOpen={onOpen} />}
            {accountCards.length > 0 && (
                <>
                    <h4 className={styles.subheading}>Accounts</h4>
                    <KpiStrip label="Account totals" items={accountCards.map(([label, value]) => ({ label, value }))} />
                </>
            )}
        </div>
    );
}
