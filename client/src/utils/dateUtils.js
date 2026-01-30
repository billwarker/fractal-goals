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
        const [year, month, day] = dateValue.split('-').map(Number);
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
        timeZone: timezone
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

/**
 * Convert a local datetime string (YYYY-MM-DD HH:MM:SS) to ISO string
 * @param {string} localDateStr - Local datetime string
 * @param {string} timezone - IANA timezone
 * @returns {string} ISO string
 */
export const localToISO = (localDateStr, timezone) => {
    if (!localDateStr) return null;

    // Parse the local string
    const [datePart, timePart] = localDateStr.split(' ');
    const [year, month, day] = datePart.split('-');
    const timeComponents = (timePart || '00:00:00').split(':');
    const hour = timeComponents[0] || '00';
    const minute = timeComponents[1] || '00';
    const second = timeComponents[2] || '00';

    // Create a date string that will be interpreted in the specified timezone
    const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    // Use Intl to get the UTC offset for this timezone at this date
    const date = new Date(dateStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // This is a workaround - create the date assuming UTC, then adjust
    const utcDate = new Date(`${dateStr}Z`);
    const localParts = formatter.formatToParts(utcDate);

    // Calculate offset
    const localYear = parseInt(localParts.find(p => p.type === 'year').value);
    const localMonth = parseInt(localParts.find(p => p.type === 'month').value) - 1;
    const localDay = parseInt(localParts.find(p => p.type === 'day').value);
    const localHour = parseInt(localParts.find(p => p.type === 'hour').value);
    const localMinute = parseInt(localParts.find(p => p.type === 'minute').value);

    const localDate = new Date(Date.UTC(localYear, localMonth, localDay, localHour, localMinute));
    const targetDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second)));

    const offset = localDate.getTime() - utcDate.getTime();
    const adjustedDate = new Date(targetDate.getTime() - offset);

    return adjustedDate.toISOString();
};

/**
 * Create a Date object where the local time components match the wall time
 * in the specified timezone. This allows libraries like moment.js (without timezone support)
 * to format dates as if they were in the target timezone.
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
        fractionalSecondDigits: 3
    });

    const parts = formatter.formatToParts(date);
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
