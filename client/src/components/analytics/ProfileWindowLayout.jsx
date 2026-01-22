/**
 * ProfileWindowLayout - Recursive layout renderer for profile windows
 * 
 * Supports:
 * - Single window view
 * - Vertical splits (side by side)
 * - Horizontal splits (stacked)
 * - Nested splits (up to 4 windows total)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Resizer component for draggable split handles
 */
function Resizer({ direction, onDrag, isDragging, setIsDragging }) {
    const isVertical = direction === 'vertical';

    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    return (
        <div
            onMouseDown={handleMouseDown}
            style={{
                width: isVertical ? '8px' : '100%',
                height: isVertical ? '100%' : '8px',
                cursor: isVertical ? 'col-resize' : 'row-resize',
                background: isDragging ? '#2196f3' : 'transparent',
                transition: isDragging ? 'none' : 'background 0.2s ease',
                position: 'relative',
                zIndex: 5,
                flexShrink: 0
            }}
            onMouseEnter={(e) => {
                if (!isDragging) {
                    e.target.style.background = '#444';
                }
            }}
            onMouseLeave={(e) => {
                if (!isDragging) {
                    e.target.style.background = 'transparent';
                }
            }}
        >
            {/* Visual handle */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: isVertical ? '4px' : '40px',
                height: isVertical ? '40px' : '4px',
                background: '#555',
                borderRadius: '2px',
                display: 'flex',
                flexDirection: isVertical ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px'
            }}>
                <div style={{
                    width: isVertical ? '2px' : '2px',
                    height: isVertical ? '2px' : '2px',
                    background: '#888',
                    borderRadius: '1px'
                }} />
                <div style={{
                    width: isVertical ? '2px' : '2px',
                    height: isVertical ? '2px' : '2px',
                    background: '#888',
                    borderRadius: '1px'
                }} />
                <div style={{
                    width: isVertical ? '2px' : '2px',
                    height: isVertical ? '2px' : '2px',
                    background: '#888',
                    borderRadius: '1px'
                }} />
            </div>
        </div>
    );
}

/**
 * LayoutNode - Recursive renderer for the layout tree
 */
function LayoutNode({
    node,
    renderWindow,
    onUpdatePosition,
    path = []
}) {
    const containerRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging || !containerRef.current) return;

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();

        let percentage;
        if (node.direction === 'vertical') {
            const x = e.clientX - rect.left;
            percentage = (x / rect.width) * 100;
        } else {
            const y = e.clientY - rect.top;
            percentage = (y / rect.height) * 100;
        }

        // Clamp between 25% and 75% to ensure minimum profile window size
        const clampedPercentage = Math.min(75, Math.max(25, percentage));
        onUpdatePosition(path, clampedPercentage);
    }, [isDragging, node.direction, onUpdatePosition, path]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Leaf node - render the profile window
    if (node.type === 'window') {
        return renderWindow(node.id, path);
    }

    // Split node - render children with resizer
    const isVertical = node.direction === 'vertical';
    const position = node.position || 50;

    return (
        <div
            ref={containerRef}
            style={{
                display: 'flex',
                flexDirection: isVertical ? 'row' : 'column',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                cursor: isDragging ? (isVertical ? 'col-resize' : 'row-resize') : 'default'
            }}
        >
            {/* First child */}
            <div style={{
                [isVertical ? 'width' : 'height']: `calc(${position}% - 4px)`,
                [isVertical ? 'height' : 'width']: '100%',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                overflow: 'hidden'
            }}>
                <LayoutNode
                    node={node.first}
                    renderWindow={renderWindow}
                    onUpdatePosition={onUpdatePosition}
                    path={[...path, 'first']}
                />
            </div>

            {/* Resizer */}
            <Resizer
                direction={node.direction}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
            />

            {/* Second child */}
            <div style={{
                [isVertical ? 'width' : 'height']: `calc(${100 - position}% - 4px)`,
                [isVertical ? 'height' : 'width']: '100%',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                overflow: 'hidden'
            }}>
                <LayoutNode
                    node={node.second}
                    renderWindow={renderWindow}
                    onUpdatePosition={onUpdatePosition}
                    path={[...path, 'second']}
                />
            </div>
        </div>
    );
}

/**
 * ProfileWindowLayout - Main component
 */
function ProfileWindowLayout({
    layout,
    onLayoutChange,
    renderWindow
}) {
    // Update position at a specific path in the layout tree
    const handleUpdatePosition = useCallback((path, position) => {
        onLayoutChange(prevLayout => {
            const newLayout = JSON.parse(JSON.stringify(prevLayout));
            let node = newLayout;

            for (const key of path) {
                node = node[key];
            }

            node.position = position;
            return newLayout;
        });
    }, [onLayoutChange]);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            overflow: 'hidden'
        }}>
            <LayoutNode
                node={layout}
                renderWindow={renderWindow}
                onUpdatePosition={handleUpdatePosition}
            />
        </div>
    );
}

export default ProfileWindowLayout;

// Helper functions for manipulating the layout tree

/**
 * Count total windows in layout
 */
export function countWindows(node) {
    if (node.type === 'window') return 1;
    return countWindows(node.first) + countWindows(node.second);
}

/**
 * Get all window IDs in the layout
 */
export function getWindowIds(node) {
    if (node.type === 'window') return [node.id];
    return [...getWindowIds(node.first), ...getWindowIds(node.second)];
}

/**
 * Split a window in the layout tree
 */
export function splitWindow(layout, windowId, direction, newWindowId) {
    if (layout.type === 'window') {
        if (layout.id === windowId) {
            return {
                type: 'split',
                direction,
                position: 50,
                first: { type: 'window', id: windowId },
                second: { type: 'window', id: newWindowId }
            };
        }
        return layout;
    }

    return {
        ...layout,
        first: splitWindow(layout.first, windowId, direction, newWindowId),
        second: splitWindow(layout.second, windowId, direction, newWindowId)
    };
}

/**
 * Remove a window from the layout tree
 * Returns the sibling node when a window is removed from a split
 */
export function removeWindow(layout, windowId) {
    if (layout.type === 'window') {
        return layout.id === windowId ? null : layout;
    }

    // Check if this split contains the window to remove
    if (layout.first.type === 'window' && layout.first.id === windowId) {
        return layout.second;
    }
    if (layout.second.type === 'window' && layout.second.id === windowId) {
        return layout.first;
    }

    // Recurse into children
    const newFirst = removeWindow(layout.first, windowId);
    const newSecond = removeWindow(layout.second, windowId);

    // If a child was removed and replaced with null, use the sibling
    if (newFirst === null) return newSecond;
    if (newSecond === null) return newFirst;

    return {
        ...layout,
        first: newFirst,
        second: newSecond
    };
}

/**
 * Find the path to a window in the layout tree
 */
export function findWindowPath(layout, windowId, path = []) {
    if (layout.type === 'window') {
        return layout.id === windowId ? path : null;
    }

    const firstPath = findWindowPath(layout.first, windowId, [...path, 'first']);
    if (firstPath) return firstPath;

    return findWindowPath(layout.second, windowId, [...path, 'second']);
}

/**
 * Get the sibling window ID (for annotations panel logic)
 */
export function getSiblingWindowId(layout, windowId) {
    if (layout.type === 'window') return null;

    if (layout.first.type === 'window' && layout.first.id === windowId) {
        return layout.second.type === 'window' ? layout.second.id : null;
    }
    if (layout.second.type === 'window' && layout.second.id === windowId) {
        return layout.first.type === 'window' ? layout.first.id : null;
    }

    const firstResult = getSiblingWindowId(layout.first, windowId);
    if (firstResult) return firstResult;

    return getSiblingWindowId(layout.second, windowId);
}

/**
 * Update split position for a specific window (for annotations shrinking)
 */
export function setSplitPositionForWindow(layout, windowId, position, setFirst = true) {
    if (layout.type === 'window') return layout;

    // Check if this split contains the target window
    if (layout.first.type === 'window' && layout.first.id === windowId) {
        return { ...layout, position: setFirst ? position : (100 - position) };
    }
    if (layout.second.type === 'window' && layout.second.id === windowId) {
        return { ...layout, position: setFirst ? (100 - position) : position };
    }

    return {
        ...layout,
        first: setSplitPositionForWindow(layout.first, windowId, position, setFirst),
        second: setSplitPositionForWindow(layout.second, windowId, position, setFirst)
    };
}
