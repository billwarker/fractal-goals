/**
 * Column bars have square corners and fill most of their category slot, so a few bars read as wide
 * blocks and many as narrow ones. The cap only stops a lone bar from spanning the whole plot.
 */
export const BAR_MARKS = { borderRadius: 0, maxBarThickness: 160 };

/** Horizontal bars are rows of text-height, so they stay thin however few there are. */
export const ROW_BAR_MARKS = { borderRadius: 0, maxBarThickness: 32 };

/** Histogram bins are adjacent ranges of one measure, so they nearly touch. */
export const HISTOGRAM_BAR_MARKS = { borderRadius: 0, categoryPercentage: 1, barPercentage: 0.96 };
