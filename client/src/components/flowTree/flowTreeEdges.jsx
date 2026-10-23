import { BaseEdge } from 'reactflow';

/** Custom React Flow edges for the goal flow tree. */
function TreeCenterEdge({ data, style, className }) {
    const source = data?.sourceCenter;
    const target = data?.targetCenter;
    if (!source || !target) return null;

    return (
        <BaseEdge
            path={`M ${source.x} ${source.y} L ${target.x} ${target.y}`}
            style={style}
            className={className}
        />
    );
}

/** A sequence arrow between sibling icons, arcing above the row, clear of the labels beside and below them. */
// Distance from a badge's centre to its border along a unit direction.
const badgeEdgeDistance = (box, ux, uy) => Math.min(
    ux ? box.halfWidth / Math.abs(ux) : Infinity,
    uy ? box.halfHeight / Math.abs(uy) : Infinity,
);

/** A straight dashed arrow from one step's number badge to the next's, drawn beneath node text. */
function SequenceEdge({ data, style, className, markerEnd }) {
    const source = data?.sourceBox;
    const target = data?.targetBox;
    if (!source || !target) return null;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const start = badgeEdgeDistance(source, ux, uy);
    // The arrowhead's tip sits at the path end, so ending on the border makes it touch the badge.
    const end = badgeEdgeDistance(target, ux, uy);
    return (
        <BaseEdge
            path={`M ${source.x + ux * start} ${source.y + uy * start} L ${target.x - ux * end} ${target.y - uy * end}`}
            style={style}
            className={className}
            markerEnd={markerEnd}
        />
    );
}

export const flowTreeEdgeTypes = {
    treeCenter: TreeCenterEdge,
    sequence: SequenceEdge,
};
