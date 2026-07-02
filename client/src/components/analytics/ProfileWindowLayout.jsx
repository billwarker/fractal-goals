/**
 * Compatibility re-export. The canonical grid layout engine now lives in the
 * shared surface module (`components/surface/gridLayout/GridLayout.jsx`) so that
 * both the analytics dashboard and the configurable page surface consume a
 * single implementation. This shim preserves the historical import path.
 */
export { default } from '../surface/gridLayout/GridLayout';
export * from '../surface/gridLayout/GridLayout';
