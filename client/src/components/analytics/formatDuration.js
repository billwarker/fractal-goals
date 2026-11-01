import { formatDuration as formatChartDuration } from '../../utils/chartFormat';

/** Analytics' duration text ("1h 5m", "45m"); see utils/chartFormat.js. */
export const formatDuration = (seconds) => formatChartDuration(seconds);
