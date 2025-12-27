/**
 * Date/Time formatting utilities with timezone support
 */

/**
 * Format a date/datetime string to a localized string in the specified timezone
 * @param {string|Date} dateValue - ISO string or Date object
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York')
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDateInTimezone = (dateValue, timezone, options = {}) => {
    if (!dateValue) return '';

    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

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

    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;

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
