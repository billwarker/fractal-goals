/**
 * Tests for useSessionDuration hook and utility functions
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
    formatDuration,
    formatShortDuration,
    calculateSessionDuration,
    calculateSectionDuration,
    useSessionDuration
} from '../useSessionDuration';

describe('formatDuration', () => {
    it('returns "-" for null seconds', () => {
        expect(formatDuration(null)).toBe('-');
    });

    it('returns "-" for zero seconds', () => {
        expect(formatDuration(0)).toBe('-');
    });

    it('returns "-" for negative seconds', () => {
        expect(formatDuration(-100)).toBe('-');
    });

    it('formats minutes correctly (no hours)', () => {
        expect(formatDuration(300)).toBe('0:05'); // 5 minutes
        expect(formatDuration(1800)).toBe('0:30'); // 30 minutes
        expect(formatDuration(3540)).toBe('0:59'); // 59 minutes
    });

    it('formats hours and minutes correctly', () => {
        expect(formatDuration(3600)).toBe('1:00'); // 1 hour
        expect(formatDuration(3660)).toBe('1:01'); // 1 hour 1 minute
        expect(formatDuration(7200)).toBe('2:00'); // 2 hours
        expect(formatDuration(5400)).toBe('1:30'); // 1.5 hours
    });

    it('pads minutes with leading zero', () => {
        expect(formatDuration(3660)).toBe('1:01');
        expect(formatDuration(3900)).toBe('1:05');
    });
});

describe('formatShortDuration', () => {
    it('returns "--:--" for null or undefined', () => {
        expect(formatShortDuration(null)).toBe('--:--');
        expect(formatShortDuration(undefined)).toBe('--:--');
    });

    it('returns "--:--" for zero or negative', () => {
        expect(formatShortDuration(0)).toBe('--:--');
        expect(formatShortDuration(-10)).toBe('--:--');
    });

    it('formats seconds correctly in MM:SS format', () => {
        expect(formatShortDuration(65)).toBe('01:05');
        expect(formatShortDuration(125)).toBe('02:05');
        expect(formatShortDuration(600)).toBe('10:00');
    });

    it('handles large durations', () => {
        expect(formatShortDuration(3661)).toBe('61:01'); // Over an hour shows total minutes
    });
});

describe('calculateSessionDuration', () => {
    it('returns null for null session', () => {
        expect(calculateSessionDuration(null)).toBe(null);
    });

    it('returns null for session with no duration data', () => {
        const session = { attributes: {} };
        expect(calculateSessionDuration(session)).toBe(null);
    });

    it('calculates from session_start and session_end (priority 1)', () => {
        const session = {
            attributes: {
                session_data: {
                    session_start: '2024-01-01T10:00:00Z',
                    session_end: '2024-01-01T11:30:00Z' // 1.5 hours = 5400 seconds
                },
                total_duration_seconds: 1000 // Should be ignored
            }
        };
        expect(calculateSessionDuration(session)).toBe(5400);
    });

    it('calculates from top-level session_start/session_end when session_data is missing them', () => {
        const session = {
            session_start: '2024-01-01T10:00:00Z',
            session_end: '2024-01-01T11:30:00Z',
            attributes: {
                session_data: {},
                total_duration_seconds: 1000
            }
        };
        expect(calculateSessionDuration(session)).toBe(5400);
    });

    it('falls back to total_duration_seconds (priority 2)', () => {
        const session = {
            attributes: {
                total_duration_seconds: 3600,
                session_data: {}
            }
        };
        expect(calculateSessionDuration(session)).toBe(3600);
    });

    it('falls back to top-level total_duration_seconds when attributes value is missing', () => {
        const session = {
            total_duration_seconds: 3600,
            attributes: {
                session_data: {}
            }
        };
        expect(calculateSessionDuration(session)).toBe(3600);
    });

    it('sums activity durations (priority 3)', () => {
        const session = {
            attributes: {
                session_data: {
                    sections: [
                        {
                            exercises: [
                                { instance_id: '1', duration_seconds: 300 },
                                { instance_id: '2', duration_seconds: 600 },
                                { duration_seconds: 100 } // No instance_id, should be ignored
                            ]
                        },
                        {
                            exercises: [
                                { instance_id: '3', duration_seconds: 900 }
                            ]
                        }
                    ]
                }
            }
        };
        expect(calculateSessionDuration(session)).toBe(1800); // 300 + 600 + 900
    });

    it('handles invalid start/end dates gracefully', () => {
        const session = {
            attributes: {
                session_data: {
                    session_start: 'invalid-date',
                    session_end: 'also-invalid'
                },
                total_duration_seconds: 600
            }
        };
        // Should fall back to total_duration_seconds
        expect(calculateSessionDuration(session)).toBe(600);
    });
});

describe('calculateSectionDuration', () => {
    it('returns 0 for null or undefined section', () => {
        expect(calculateSectionDuration(null)).toBe(0);
        expect(calculateSectionDuration(undefined)).toBe(0);
    });

    it('returns 0 for section with no exercises', () => {
        expect(calculateSectionDuration({})).toBe(0);
        expect(calculateSectionDuration({ exercises: [] })).toBe(0);
    });

    it('sums duration from exercises with instance_id', () => {
        const section = {
            exercises: [
                { instance_id: '1', duration_seconds: 120 },
                { instance_id: '2', duration_seconds: 180 },
                { duration_seconds: 60 } // No instance_id, skipped
            ]
        };
        expect(calculateSectionDuration(section)).toBe(300);
    });
});

describe('useSessionDuration hook', () => {
    it('returns formatted duration and metadata', () => {
        const session = {
            attributes: {
                total_duration_seconds: 3660  // 1 hour 1 minute
            }
        };

        const { result } = renderHook(() => useSessionDuration(session));

        expect(result.current.seconds).toBe(3660);
        expect(result.current.formatted).toBe('1:01');
        expect(result.current.hasData).toBe(true);
    });

    it('returns hasData false when no duration available', () => {
        const session = { attributes: {} };

        const { result } = renderHook(() => useSessionDuration(session));

        expect(result.current.seconds).toBe(null);
        expect(result.current.formatted).toBe('-');
        expect(result.current.hasData).toBe(false);
    });
});
