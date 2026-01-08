/**
 * RelatedMode - Shows related/linked entities for the current context
 */

import React from 'react';
import { useSidePane } from '../SidePaneContext';
import { useNavigate } from 'react-router-dom';

const RelatedMode = () => {
    const { activeContext, selectItem } = useSidePane();
    const navigate = useNavigate();

    if (!activeContext) {
        return (
            <div className="related-mode-empty">
                <p>Select an item to view related entities</p>
            </div>
        );
    }

    const relatedEntities = activeContext.relatedEntities || [];

    if (relatedEntities.length === 0) {
        return (
            <div className="related-mode-empty">
                <span className="related-icon">🔗</span>
                <p>No related entities</p>
            </div>
        );
    }

    const handleEntityClick = (entity) => {
        // Navigate to entity or select it in sidepane
        if (entity.type === 'session') {
            navigate(`/${activeContext.rootId}/session/${entity.id}`);
        } else if (entity.type === 'goal') {
            // Select in sidepane to show details
            selectItem({
                type: 'goal',
                id: entity.id,
                name: entity.name,
                rootId: activeContext.rootId,
                entityType: 'goal',
                entityId: entity.id,
                availableModes: ['notes', 'details', 'related', 'history'],
            });
        } else if (entity.type === 'program') {
            navigate(`/${activeContext.rootId}/programs/${entity.id}`);
        }
    };

    return (
        <div className="related-mode">
            {relatedEntities.map((group, i) => (
                <div key={i} className="related-group">
                    <h4 className="related-group-title">
                        {group.label}
                        <span className="related-count">({group.items?.length || 0})</span>
                    </h4>

                    {group.items && group.items.length > 0 ? (
                        <div className="related-items">
                            {group.items.map(item => (
                                <button
                                    key={item.id}
                                    className="related-item"
                                    onClick={() => handleEntityClick({ ...item, type: group.type })}
                                >
                                    <span className="related-item-icon">
                                        {getEntityIcon(group.type)}
                                    </span>
                                    <span className="related-item-name">{item.name}</span>
                                    {item.completed && (
                                        <span className="related-item-status">✅</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="related-empty-text">None</p>
                    )}
                </div>
            ))}
        </div>
    );
};

const getEntityIcon = (type) => {
    switch (type) {
        case 'session':
        case 'sessions': return '⏱️';
        case 'goal':
        case 'goals': return '🎯';
        case 'program':
        case 'programs': return '📅';
        case 'activity':
        case 'activities': return '🏋️';
        default: return '📄';
    }
};

export default RelatedMode;
