import {
    BRAND_INK,
    BRAND_MARK_STROKE,
    BRAND_RED,
    brandMarkSquares,
    brandMarkViewBox,
} from '../../brand/logoGeometry';

const SQUARES = brandMarkSquares();
const VIEW_BOX = brandMarkViewBox();

// The Fractal Goals logo. Decorative unless given a title.
function BrandMark({ size = 32, title, className = '', ...props }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox={VIEW_BOX}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : 'true'}
            aria-label={title || undefined}
            focusable="false"
            {...props}
        >
            <g fill={BRAND_INK} stroke={BRAND_RED} strokeWidth={BRAND_MARK_STROKE} strokeLinejoin="miter">
                {SQUARES.map(({ key, x, y, size: side, transform }) => (
                    <rect key={key} x={x} y={y} width={side} height={side} transform={transform} />
                ))}
            </g>
        </svg>
    );
}

export default BrandMark;
