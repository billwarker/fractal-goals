import {
    addDays,
    differenceInCalendarDays,
    format as formatDateFns,
    isBefore,
    startOfDay,
    subDays,
} from 'date-fns';

/**
 * Date/Time formatting utilities with timezone support
 * 
 * USAGE GUIDELINES:
 * - Use getLocalISOString() when creating timestamps (session_start, session_end, etc.)
 * - Use getTodayLocalDate() when you only need a date (no time component)
 * - Use parseAnyDate() to safely parse any incoming date string
 * - Use formatForInput() to display dates in input fields
 * - Use formatDateInTimezone() for general display formatting
 */

/**
 * Get current time as a UTC ISO string
 * This ensures backend receives an unambiguous time
 * @returns {string} ISO string in format "YYYY-MM-DDTHH:MM:SS.sssZ"
 */
export const getLocalISOString = () => {
    return new Date().toISOString();
};

/**
 * Get today's date as a local date string (YYYY-MM-DD)
 * Use this when you only need the date without time
 * @returns {string} Date string in format "YYYY-MM-DD"
 */
export const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

/**
 * Safely parse any date string, handling both date-only and datetime formats
 * @param {string} dateString - Any date string
 * @returns {Date} Parsed Date object
 */
export const parseAnyDate = (dateString) => {
    if (!dateString) return null;

    // If it's just a date (YYYY-MM-DD), parse as local date at midnight
    if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-') && !dateString.includes('T')) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    // If it's a datetime without timezone (YYYY-MM-DD HH:MM:SS), 
    // we assume UTC because all backend datetimes are UTC.
    if (typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('Z') && !dateString.includes('+')) {
        const [datePart, timePart] = dateString.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);
        // Use Date.UTC to ensure it's interpreted as UTC
        return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, seconds || 0));
    }

    // If it's an ISO datetime string without timezone (YYYY-MM-DDTHH:MM:SS), 
    // we assume UTC because the backend stores everything in UTC and might 
    // be sending naive strings (missing 'Z') if the server hasn't reloaded.
    if (typeof dateString === 'string' && dateString.includes('T') && !dateString.includes('Z') && !dateString.includes('+')) {
        return new Date(dateString + 'Z');
    }

    // Otherwise use standard parsing (handles ISO strings with Z suffix)
    return new Date(dateString);
};

/**
 * Format a date/datetime string to a localized string in the specified timezone
 * @param {string|Date} dateValue - ISO string or Date object
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York')
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDateInTimezone = (dateValue, timezone, options = {}) => {
    if (!dateValue) return '';

    const date = typeof dateValue === 'string' ? parseAnyDate(dateValue) : dateValue;

    const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
        ...options
    };

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
};

/**
 * Extract the literal YYYY-MM-DD part of a date string or object 
 * WITHOUT any timezone conversion. Use this for absolute dates like deadlines.
 * @param {string|Date} dateValue 
 * @returns {string} YYYY-MM-DD
 */
export const getDatePart = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue === 'string') {
        // If it's already YYYY-MM-DD, return it
        if (dateValue.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }
        // If it's an ISO string (2026-01-31T00:00:00Z), grab the first 10 chars
        if (dateValue.includes('T')) {
            return dateValue.split('T')[0];
        }
        // Fallback: try to parse and then extract components manually to avoid offset
        const parts = dateValue.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (parts) return `${parts[1]}-${parts[2]}-${parts[3]}`;
    }

    const d = new Date(dateValue);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Format a date without any timezone shifting (uses UTC/Literal parts)
 * @param {string|Date} dateValue 
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatLiteralDate = (dateValue, options = {}) => {
    if (!dateValue) return '';
    const datePart = getDatePart(dateValue);
    const [year, month, day] = datePart.split('-').map(Number);

    // Create a date object that will return the correct parts in any timezone for formatting
    // By using the local Date constructor with these parts, we can format it.
    // Or just use Intl.DateTimeFormat with 'UTC' to be safe.
    const date = new Date(Date.UTC(year, month - 1, day));

    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
        ...options
    };

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
};

export const parseDateOnly = (dateValue) => {
    const datePart = getDatePart(dateValue);
    if (!datePart) return null;
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const MOMENT_TO_DATE_FNS_TOKENS = {
    'MMM D, YYYY': 'MMM d, yyyy',
    'MMM D': 'MMM d',
    dddd: 'EEEE',
    'h:mm A': 'h:mm a',
    'YYYY-MM-DD': 'yyyy-MM-dd',
};

const normalizeFormatToken = (formatString = 'MMM D, YYYY') => (
    MOMENT_TO_DATE_FNS_TOKENS[formatString] || formatString
);

export const formatDateValue = (dateValue, formatString = 'MMM D, YYYY', timezone = null) => {
    if (!dateValue) return '';

    const shiftedDate = timezone
        ? getShiftedDate(dateValue, timezone)
        : (typeof dateValue === 'string' ? parseAnyDate(dateValue) : dateValue);

    if (!(shiftedDate instanceof Date) || Number.isNaN(shiftedDate.getTime())) {
        return '';
    }

    return formatDateFns(shiftedDate, normalizeFormatToken(formatString));
};

export const addDaysToDateString = (dateValue, amount) => {
    const date = parseDateOnly(dateValue);
    if (!date) return null;
    return formatDateFns(addDays(date, amount), 'yyyy-MM-dd');
};

export const subtractDaysToDateString = (dateValue, amount) => {
    const date = parseDateOnly(dateValue);
    if (!date) return null;
    return formatDateFns(subDays(date, amount), 'yyyy-MM-dd');
};

export const getDayOfWeekIndex = (dateValue) => {
    const date = parseDateOnly(dateValue);
    return date ? date.getDay() : null;
};

export const getWeekdayName = (dateValue) => {
    const date = parseDateOnly(dateValue);
    return date ? formatDateFns(date, 'EEEE') : '';
};

export const isDateBeforeToday = (dateValue, now = new Date()) => {
    const date = parseDateOnly(dateValue);
    if (!date) return false;
    return isBefore(date, startOfDay(now));
};

export const getDaysRemaining = (dateValue, now = new Date()) => {
    const date = parseDateOnly(dateValue);
    if (!date) return 0;
    return Math.max(0, differenceInCalendarDays(date, startOfDay(now)));
};

export const getDurationDaysInclusive = (startDateValue, endDateValue) => {
    const start = parseDateOnly(startDateValue);
    const end = parseDateOnly(endDateValue);
    if (!start || !end) return 0;
    return Math.max(0, differenceInCalendarDays(end, start) + 1);
};

export const getWeeksSpanned = (startDateValue, endDateValue) => {
    const days = getDurationDaysInclusive(startDateValue, endDateValue);
    if (days <= 1) {
        return days > 0 ? 1 : 0;
    }
    return Math.ceil((days - 1) / 7);
};

export const getRecurringDatesWithinRange = (startDateValue, endDateValue, dayOfWeekIndexes = []) => {
    const start = parseDateOnly(startDateValue);
    const end = parseDateOnly(endDateValue);

    if (!start || !end || dayOfWeekIndexes.length === 0) {
        return [];
    }

    const activeDays = new Set(dayOfWeekIndexes);
    const dates = [];

    for (let current = start; current <= end; current = addDays(current, 1)) {
        if (activeDays.has(current.getDay())) {
            dates.push(formatDateFns(current, 'yyyy-MM-dd'));
        }
    }

    return dates;
};

export const isDateWithinRange = (dateValue, startDateValue, endDateValue) => {
    const date = getDatePart(dateValue);
    const start = getDatePart(startDateValue);
    const end = getDatePart(endDateValue);

    if (!date || !start || !end) return false;
    return date >= start && date <= end;
};

export const formatDurationHuman = (seconds) => {
    if (!seconds || seconds <= 0) return '0 minutes';

    if (seconds < 3600) {
        const minutes = Math.max(1, Math.round(seconds / 60));
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.round((seconds % 3600) / 60);

    if (remainingMinutes === 0) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours} hour${hours === 1 ? '' : 's'} ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`;
};

/**
 * Get the YYYY-MM-DD string for a date in the specified timezone
 * @param {string|Date} dateValue - ISO string or Date object
 * @param {string} timezone - IANA timezone
 * @returns {string} Date string (YYYY-MM-DD)
 */
export const getISOYMDInTimezone = (dateValue, timezone) => {
    if (!dateValue) return null;

    // Handle date-only strings - return as is for consistency
    if (typeof dateValue === 'string' && dateValue.length === 10 && dateValue.includes('-') && !dateValue.includes('T')) {
        return dateValue;
    }

    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

    const formatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timezone
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;

    return `${year}-${month}-${day}`;
};

/**
 * Format date only (no time) in the specified timezone
 * @param {string|Date} dateValue - ISO string or Date object
 * @param {string} timezone - IANA timezone
 * @returns {string} Formatted date string (MM/DD/YYYY)
 */
export const formatDateOnly = (dateValue, timezone) => {
    return formatDateInTimezone(dateValue, timezone, {
        hour: undefined,
        minute: undefined,
        second: undefined
    });
};

const normalizeHourPart = (parts) => {
    return parts.map((part) => (
        part.type === 'hour' && part.value === '24'
            ? { ...part, value: '00' }
            : part
    ));
};

/**
 * Format datetime for input fields (YYYY-MM-DD HH:MM:SS) in the specified timezone
 * @param {string|Date} dateValue - ISO string or Date object
 * @param {string} timezone - IANA timezone
 * @returns {string} Formatted string for input fields
 */
export const formatForInput = (dateValue, timezone) => {
    if (!dateValue) return '';

    let date;

    // Handle date-only strings (YYYY-MM-DD) - treat as local date at midnight
    if (typeof dateValue === 'string' && dateValue.length === 10 && dateValue.includes('-') && !dateValue.includes('T')) {
        // Create a local date, then format it without timezone conversion
        return `${dateValue} 00:00:00`;
    }

    date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

    // Get parts in the specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        hourCycle: 'h23',
        timeZone: timezone
    });

    const parts = normalizeHourPart(formatter.formatToParts(date));
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const parseLocalDateTimeParts = (localDateStr) => {
    const match = String(localDateStr).trim().match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})(?::(\d{2})(?::(\d{2}))?)?)?$/
    );
    if (!match) {
        throw new Error('Invalid local datetime format');
    }

    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    const parts = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
    };

    const isValidRange = (
        parts.month >= 1 && parts.month <= 12 &&
        parts.day >= 1 && parts.day <= 31 &&
        parts.hour >= 0 && parts.hour <= 23 &&
        parts.minute >= 0 && parts.minute <= 59 &&
        parts.second >= 0 && parts.second <= 59
    );

    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const isValidDate = (
        date.getUTCFullYear() === parts.year &&
        date.getUTCMonth() === parts.month - 1 &&
        date.getUTCDate() === parts.day
    );

    if (!isValidRange || !isValidDate) {
        throw new Error('Invalid local datetime value');
    }

    return parts;
};

/**
 * Convert a local datetime string (YYYY-MM-DD HH:MM:SS) to ISO string
 * @param {string} localDateStr - Local datetime string
 * @param {string} timezone - IANA timezone
 * @returns {string} ISO string
 */
export const localToISO = (localDateStr, timezone) => {
    if (!localDateStr) return null;

    const { year, month, day, hour, minute, second } = parseLocalDateTimeParts(localDateStr);

    // Create a date string that will be interpreted in the specified timezone
    const dateStr = [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
    ].join('-') + `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

    // Use Intl to get the UTC offset for this timezone at this date
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    });

    // This is a workaround - create the date assuming UTC, then adjust
    const utcDate = new Date(`${dateStr}Z`);
    const localParts = normalizeHourPart(formatter.formatToParts(utcDate));

    // Calculate offset
    const localYear = parseInt(localParts.find(p => p.type === 'year').value);
    const localMonth = parseInt(localParts.find(p => p.type === 'month').value) - 1;
    const localDay = parseInt(localParts.find(p => p.type === 'day').value);
    const localHour = parseInt(localParts.find(p => p.type === 'hour').value);
    const localMinute = parseInt(localParts.find(p => p.type === 'minute').value);
    const localSecond = parseInt(localParts.find(p => p.type === 'second').value);

    const localDate = new Date(Date.UTC(localYear, localMonth, localDay, localHour, localMinute, localSecond));
    const targetDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    const offset = localDate.getTime() - utcDate.getTime();
    const adjustedDate = new Date(targetDate.getTime() - offset);

    return adjustedDate.toISOString();
};

export const parseRelativeTimeAdjustment = (adjustmentCode) => {
    const match = String(adjustmentCode).trim().match(/^([+-])\s*(\d+)\s*([HMS])$/i);
    if (!match) {
        throw new Error('Use +10M, -2H, or +30S');
    }

    const [, sign, amountValue, unitValue] = match;
    const amount = Number(amountValue);
    if (!Number.isSafeInteger(amount)) {
        throw new Error('Invalid adjustment amount');
    }

    const unit = unitValue.toUpperCase();
    const multiplier = unit === 'H' ? 3600 : unit === 'M' ? 60 : 1;
    return (sign === '-' ? -1 : 1) * amount * multiplier;
};

export const applyRelativeTimeAdjustment = (localDateStr, adjustmentCode, timezone) => {
    const isoValue = localToISO(localDateStr, timezone);
    const adjustmentSeconds = parseRelativeTimeAdjustment(adjustmentCode);
    const adjustedDate = new Date(new Date(isoValue).getTime() + adjustmentSeconds * 1000);
    return adjustedDate.toISOString();
};

/**
 * Create a Date object where the local time components match the wall time
 * in the specified timezone. This is useful when local formatting helpers
 * need to reflect the wall time for a target timezone.
 * 
 * @param {Date|string} dateValue - The real date/time
 * @param {string} timezone - Target timezone IANA string
 * @returns {Date} A "shifted" Date object
 */
export const getShiftedDate = (dateValue, timezone) => {
    if (!dateValue || !timezone) return dateValue ? new Date(dateValue) : null;

    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

    // Get the wall time parts in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        hourCycle: 'h23',
        fractionalSecondDigits: 3
    });

    const parts = normalizeHourPart(formatter.formatToParts(date));
    const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || 0);

    const year = getPart('year');
    const month = getPart('month') - 1; // 0-indexed
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    // millisecond might be missing from parts in some environments or require specific options
    // simpler to just carry over ms from original date if possible, but strict mapping is safer.
    // Let's ignore ms for display formatting usually.

    // Create new date using LOCAL constructor
    return new Date(year, month, day, hour, minute, second);
};
