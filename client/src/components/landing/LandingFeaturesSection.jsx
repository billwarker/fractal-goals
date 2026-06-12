import React, { useMemo, useState } from 'react';
import { GoalLevelsProvider } from '../../contexts/GoalLevelsContext';
import landingContent from '../../content/landingContent';
import LandingSkeleton from './LandingSkeleton';
import LandingFeatureSession from './LandingFeatureSession';
import LandingFeatureActivity from './LandingFeatureActivity';
import LandingFeaturePrograms from './LandingFeaturePrograms';
import LandingFeatureAnalytics from './LandingFeatureAnalytics';
import LandingFeatureMore from './LandingFeatureMore';
import {
    resolveFeaturedActivities,
    resolveFeaturedCharts,
    resolveFeaturedProgram,
    resolveFeaturedSession,
} from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';

const FEATURE_ORDER = ['session', 'activity', 'programs', 'analytics', 'more'];

// The landing Features section: a standalone feature toggle row (deliberately
// detached from the stage frame), with the explainer copy embedded at the top of
// a goal-explorer-width feature surface.
export default function LandingFeaturesSection({
    example,
    seedLevels = [],
    isMobile = false,
    isLoading = false,
    onGoalSelect,
    className = '',
}) {
    const [activeFeature, setActiveFeature] = useState(FEATURE_ORDER[0]);
    const content = landingContent.features;
    const activeItem = content.items[activeFeature];

    const featuredSession = useMemo(() => resolveFeaturedSession(example), [example]);
    const featuredActivities = useMemo(() => resolveFeaturedActivities(example), [example]);
    const featuredProgram = useMemo(() => resolveFeaturedProgram(example), [example]);
    const featuredCharts = useMemo(() => resolveFeaturedCharts(example), [example]);

    const renderStage = () => {
        if (isLoading || !example) {
            return (
                <div className={styles.stageSkeleton} data-testid="features-stage-skeleton">
                    <LandingSkeleton height="38px" width="60%" />
                    <LandingSkeleton height="220px" />
                    <LandingSkeleton height="120px" />
                </div>
            );
        }
        switch (activeFeature) {
            case 'session':
                return <LandingFeatureSession example={example} session={featuredSession} />;
            case 'activity':
                return (
                    <LandingFeatureActivity
                        example={example}
                        activities={featuredActivities}
                        onGoalSelect={onGoalSelect}
                    />
                );
            case 'programs':
                return (
                    <LandingFeaturePrograms
                        example={example}
                        program={featuredProgram.program}
                        windowStart={featuredProgram.windowStart}
                        windowEnd={featuredProgram.windowEnd}
                        isMobile={isMobile}
                    />
                );
            case 'analytics':
                return <LandingFeatureAnalytics charts={featuredCharts} />;
            case 'more':
            default:
                return <LandingFeatureMore extras={content.extras} />;
        }
    };

    return (
        <section
            className={`${styles.featuresSection}${className ? ` ${className}` : ''}`}
            id="features"
            aria-labelledby="features-title"
        >
            <div className={styles.sectionHeader}>
                <p className={styles.eyebrow}>{content.eyebrow}</p>
                <h2 id="features-title">{content.title}</h2>
                <p>{content.body}</p>
            </div>

            <div className={styles.featureToggle} role="tablist" aria-label="Product features">
                {isLoading && !example
                    ? FEATURE_ORDER.map((key) => (
                        <LandingSkeleton key={key} height="44px" width="110px" radius="999px" />
                    ))
                    : FEATURE_ORDER.map((key) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeFeature === key}
                            className={activeFeature === key ? styles.featureToggleActive : ''}
                            onClick={() => setActiveFeature(key)}
                            key={key}
                        >
                            {content.items[key].label}
                        </button>
                    ))}
            </div>

            <div className={styles.featureLayout}>
                <div className={styles.featureStage}>
                    <div className={styles.featureStageIntro}>
                        {isLoading && !example ? (
                            <>
                                <LandingSkeleton height="34px" width="46%" />
                                <LandingSkeleton height="60px" width="72%" />
                            </>
                        ) : (
                            <>
                                <h3>{activeItem.heading}</h3>
                                <p>{activeItem.body}</p>
                            </>
                        )}
                    </div>
                    <div className={styles.stageBody}>
                        <GoalLevelsProvider seedLevels={seedLevels}>
                            {renderStage()}
                        </GoalLevelsProvider>
                    </div>
                </div>
            </div>
        </section>
    );
}
