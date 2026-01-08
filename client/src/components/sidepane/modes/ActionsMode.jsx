/**
 * ActionsMode - Quick actions for the current context
 */

import React from 'react';
import { useSidePane } from '../SidePaneContext';
import { useNavigate } from 'react-router-dom';

const ActionsMode = () => {
    const { activeContext } = useSidePane();
    const navigate = useNavigate();

    if (!activeContext) {
        return (
            <div className="actions-mode-empty">
                <p>Select an item to view actions</p>
            </div>
        );
    }

    const actions = activeContext.actions || [];

    if (actions.length === 0) {
        return (
            <div className="actions-mode-empty">
                <span className="actions-icon">⚡</span>
                <p>No actions available</p>
            </div>
        );
    }

    const handleAction = (action) => {
        if (action.onClick) {
            action.onClick();
            return;
        }

        // Default action handlers based on ID
        switch (action.id) {
            case 'add-session':
                navigate(`/${activeContext.rootId}/create-session`);
                break;
            case 'view-sessions':
                navigate(`/${activeContext.rootId}/sessions`);
                break;
            case 'view-goals':
                navigate(`/${activeContext.rootId}/goals`);
                break;
            case 'view-programs':
                navigate(`/${activeContext.rootId}/programs`);
                break;
            default:
                console.log('Action triggered:', action.id);
        }
    };

    return (
        <div className="actions-mode">
            <div className="actions-list">
                {actions.map(action => (
                    <button
                        key={action.id}
                        className={`action-button ${action.variant || 'default'}`}
                        onClick={() => handleAction(action)}
                        disabled={action.disabled}
                    >
                        {action.icon && (
                            <span className="action-icon">{action.icon}</span>
                        )}
                        <span className="action-label">{action.label}</span>
                    </button>
                ))}
            </div>

            {activeContext.meta?.quickInfo && (
                <div className="actions-quick-info">
                    {activeContext.meta.quickInfo}
                </div>
            )}
        </div>
    );
};

export default ActionsMode;
