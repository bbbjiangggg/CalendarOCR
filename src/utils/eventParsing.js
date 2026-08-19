/**
 * Pure event-parsing helpers (the regex fallback pipeline).
 *
 * This module deliberately has NO native/Expo imports so it can be unit-tested
 * in a plain Node/jest environment. ocrService.js re-uses `parseEventDetails`
 * here as its fallback when the GPT parse fails.
 */
import { log, warn, error as logError } from './logger';

export const createFallbackEvent = () => {
  return [{
    title: 'New Event',
    date: new Date(),
    location: '',
    description: '',
    duration: '60',
    notification: '1hr'
  }];
};

export const parseEventDetails = (text) => {
  try {
    log('===== STARTING EVENT PARSING =====');

    // Validate input
    if (!text || typeof text !== 'string') {
      warn('Invalid text input for parsing');
      return createFallbackEvent();
    }

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    log(`Found ${lines.length} text lines`);

    // Look for multiple date patterns to identify multiple events
    const events = [];
    const dateMatches = findAllDates(text);
    log(`Found ${dateMatches.length} date(s)`);

    if (dateMatches.length === 0) {
      // No dates found, create single event with manual entry
      log('No dates found, creating default event');
      const duration = findDurationInText(text, null); // No start time available
      return [{
        title: lines.length > 0 ? lines[0] : 'New Event',
        date: new Date(),
        location: findLocationInText(text),
        description: lines.slice(1).join(' '),
        duration: duration,
        notification: '1hr'
      }];
    }

    // For each date found, try to create an event
    dateMatches.forEach((dateMatch, index) => {
      if (!dateMatch || !dateMatch.date) {
        warn('Invalid date match found:', dateMatch);
        return;
      }

      // Extract start time from the date if available
      let startTime = null;
      if (dateMatch.hasTime) {
        startTime = {
          hours: dateMatch.date.getHours(),
          minutes: dateMatch.date.getMinutes()
        };
      }

      // Calculate duration (pass startTime for smart duration calculation from time ranges)
      const duration = findDurationInText(text, startTime);

      const eventDetails = {
        title: '',
        date: dateMatch.date,
        location: findLocationInText(text),
        description: '',
        duration: duration,
        notification: '1hr'
      };

      // Try to find title near this date
      const titleCandidate = findTitleNearDate(lines, dateMatch.originalText);
      if (titleCandidate) {
        eventDetails.title = titleCandidate;
      } else if (lines.length > 0) {
        eventDetails.title = lines[0]; // Fallback to first line
      } else {
        eventDetails.title = 'New Event';
      }

      events.push(eventDetails);
    });

    log(`===== EVENT PARSING COMPLETE (${events.length} event(s)) =====`);
    return events.length > 0 ? events : createFallbackEvent();
  } catch (error) {
    logError('Error parsing event details:', error);
    return createFallbackEvent();
  }
};

/**
 * Extract duration from text - either explicit duration or calculated from time range
 */
export const findDurationInText = (text, startTime) => {
  // First, try to find explicit duration mentions
  const durationPatterns = [
    // Hours: "1 hour", "2 hours", "1hr", "2hrs", "1.5 hours"
    { pattern: /(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/gi, multiplier: 60 },
    // Minutes: "30 minutes", "30 mins", "30min", "45 minutes"
    { pattern: /(\d+)\s*(?:minute|min)s?/gi, multiplier: 1 },
  ];

  for (const { pattern, multiplier } of durationPatterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseFloat(match[1]);
      const durationInMinutes = Math.round(value * multiplier);
      return String(durationInMinutes);
    }
  }

  // If no explicit duration, try to find time range (e.g., "7:00 PM - 9:00 PM")
  if (startTime) {
    const endTime = findEndTimeNearStartTime(text, startTime);
    if (endTime) {
      const durationMinutes = calculateDurationBetweenTimes(startTime, endTime);
      if (durationMinutes > 0) {
        return String(durationMinutes);
      }
    }
  }

  return '60'; // Default to 60 minutes (1 hour)
};

/**
 * Find end time near start time in text (looks for patterns like "7:00 PM - 9:00 PM")
 */
export const findEndTimeNearStartTime = (text, startTime) => {
  // Look for time range patterns
  // Matches: "7:00 PM - 9:00 PM", "7PM-9PM", "7:00 to 9:00 PM", "19:00-21:00"
  const rangePatterns = [
    // 12-hour with dash: "7:00 PM - 9:00 PM" or "7PM-9PM"
    /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\s*[-–—]\s*(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi,
    // 12-hour with "to": "7:00 PM to 9:00 PM"
    /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\s+(?:to|until|till)\s+(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi,
    // 12-hour start, implied PM end: "7-9 PM" or "7:00-9:00 PM"
    /(\d{1,2}):?(\d{2})?\s*[-–—]\s*(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi,
    // 24-hour format: "19:00-21:00"
    /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})(?!\s*(?:am|pm))/gi,
  ];

  for (const pattern of rangePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Try different group indices based on which pattern matched
      let endHour, endMinute, endMeridiem;

      if (match[6]) {
        // Pattern 1 or 2: Full range with both AM/PM
        endHour = parseInt(match[4]);
        endMinute = match[5] ? parseInt(match[5]) : 0;
        endMeridiem = match[6].toLowerCase();
      } else if (match[5]) {
        // Pattern 3: Start time - end time with shared AM/PM
        endHour = parseInt(match[3]);
        endMinute = match[4] ? parseInt(match[4]) : 0;
        endMeridiem = match[5].toLowerCase();
      } else if (match[4]) {
        // Pattern 4: 24-hour format
        endHour = parseInt(match[3]);
        endMinute = parseInt(match[4]);
        endMeridiem = null;
      }

      // Convert to 24-hour format if needed
      if (endMeridiem) {
        if (endMeridiem.startsWith('p') && endHour !== 12) {
          endHour += 12;
        } else if (endMeridiem.startsWith('a') && endHour === 12) {
          endHour = 0;
        }
      }

      // Validate
      if (endHour >= 0 && endHour < 24 && endMinute >= 0 && endMinute < 60) {
        return { hours: endHour, minutes: endMinute };
      }
    }
  }

  return null;
};

/**
 * Calculate duration in minutes between two time objects
 */
export const calculateDurationBetweenTimes = (startTime, endTime) => {
  const startMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;

  let duration = endMinutes - startMinutes;

  // Handle overnight events
  if (duration < 0) {
    duration += 24 * 60;
  }

  // Validate reasonable duration (5 minutes to 12 hours)
  if (duration >= 5 && duration <= 720) {
    return duration;
  }

  return 0; // Invalid duration
};

/**
 * Extract times from text and associate them with dates
 */
export const findTimesNearDate = (text, datePosition) => {
  const timePatterns = [
    // 12-hour format: 7:00 PM, 7PM, 7:00pm
    { pattern: /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/gi, name: '12-hour' },
    // 24-hour format: 19:00, 1900 (only match if NOT followed by AM/PM)
    { pattern: /(\d{1,2}):(\d{2})(?!\s*(?:am|pm|a\.m\.|p\.m\.))/gi, name: '24-hour' },
  ];

  let closestTime = null;
  let closestDistance = Infinity;

  timePatterns.forEach(({ pattern, name }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const distance = Math.abs(match.index - datePosition);

      // Look for times within 200 characters of the date
      if (distance < 200 && distance < closestDistance) {
        const parsedTime = parseTime(match, name);
        if (parsedTime) {
          closestDistance = distance;
          closestTime = parsedTime;
        }
      }
    }
  });

  return closestTime;
};

/**
 * Parse time from regex match
 */
export const parseTime = (match, patternName) => {
  try {
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3] ? match[3].toLowerCase() : null;

    if (meridiem) {
      // 12-hour format
      if (meridiem.startsWith('p') && hours !== 12) {
        hours += 12;
      } else if (meridiem.startsWith('a') && hours === 12) {
        hours = 0;
      }
    }

    // Validate time
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    } else {
      warn(`Time parsing: Invalid time - hours:${hours}, minutes:${minutes}`);
    }
  } catch (error) {
    logError('Time parsing error:', error);
  }

  return null;
};

export const findAllDates = (text) => {
  const dateMatches = [];

  const datePatterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    { pattern: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g, type: 'numeric' },
    // Month DD, YYYY
    { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/gi, type: 'monthFirst' },
    // DD Month YYYY
    { pattern: /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi, type: 'dayFirst' },
    // Month DD (current year)
    { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi, type: 'monthOnly' },
    // Abbreviated months: Dec 15, 2024 or 15 Dec 2024
    { pattern: /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi, type: 'abbrMonthFirst' },
    { pattern: /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/gi, type: 'abbrDayFirst' },
  ];

  datePatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const parsedDate = parseDate(match, type);
      if (parsedDate) {
        // Try to find time near this date
        const timeInfo = findTimesNearDate(text, match.index);

        // Apply time to date if found
        if (timeInfo) {
          parsedDate.setHours(timeInfo.hours, timeInfo.minutes, 0, 0);
        }

        dateMatches.push({
          date: parsedDate,
          originalText: match[0],
          position: match.index,
          hasTime: timeInfo !== null
        });
      }
    }
  });

  return dateMatches;
};

export const findTitleNearDate = (lines, dateText) => {
  // Simple heuristic: look for the first meaningful line that's not the date
  for (const line of lines) {
    if (!line.toLowerCase().includes(dateText.toLowerCase()) && line.length > 3) {
      return line;
    }
  }
  return null;
};

/**
 * Best-effort location extraction for the regex fallback path.
 * Looks for an explicit "Location:/Venue:/At/@" label, otherwise a line that
 * looks like a street address. Returns '' when nothing convincing is found.
 */
export const findLocationInText = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Explicit label, e.g. "Location: Room 101" or "Venue - Blue Note"
  const labelPattern = /^(?:location|venue|where|address)\s*[:\-]\s*(.+)$/i;
  for (const line of lines) {
    const m = line.match(labelPattern);
    if (m && m[1].trim().length > 1) {
      return m[1].trim();
    }
  }

  // 2. "@ Somewhere" or "at The Venue" style lines
  const atPattern = /^(?:@|at)\s+(.{3,})$/i;
  for (const line of lines) {
    const m = line.match(atPattern);
    if (m) {
      return m[1].trim();
    }
  }

  // 3. Street-address-like line (number + street suffix)
  const addressPattern = /\d+\s+[\w.\s]+\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hall|room|suite|ste)\b/i;
  for (const line of lines) {
    if (addressPattern.test(line)) {
      return line;
    }
  }

  return '';
};

export const parseDate = (match, type) => {
  const now = new Date();
  const currentYear = now.getFullYear();

  const monthNames = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  try {
    switch (type) {
      case 'numeric':
        // MM/DD/YYYY or MM-DD-YYYY
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        return new Date(year, month, day);

      case 'monthFirst':
      case 'abbrMonthFirst':
        // Month DD, YYYY or Dec 15, 2024
        const monthName1 = match[1].toLowerCase().replace(/\./g, '');
        const month1 = monthNames[monthName1];
        const day1 = parseInt(match[2]);
        const year1 = parseInt(match[3]);
        if (month1 !== undefined) {
          return new Date(year1, month1, day1);
        }
        break;

      case 'dayFirst':
      case 'abbrDayFirst':
        // DD Month YYYY or 15 Dec 2024
        const day2 = parseInt(match[1]);
        const monthName2 = match[2].toLowerCase().replace(/\./g, '');
        const month2 = monthNames[monthName2];
        const year2 = parseInt(match[3]);
        if (month2 !== undefined) {
          return new Date(year2, month2, day2);
        }
        break;

      case 'monthOnly':
        // Month DD (no year in text). Infer the year: if the date already fell
        // well in the past this year (>31 days ago), assume it means next year
        // — a "December 15" poster scanned in January is next December, not last.
        const monthName3 = match[1].toLowerCase();
        const month3 = monthNames[monthName3];
        const day3 = parseInt(match[2]);
        if (month3 !== undefined) {
          let candidate = new Date(currentYear, month3, day3);
          const msPast = now.getTime() - candidate.getTime();
          if (msPast > 31 * 24 * 60 * 60 * 1000) {
            candidate = new Date(currentYear + 1, month3, day3);
          }
          return candidate;
        }
        break;
    }
  } catch (error) {
    log('Error parsing date:', error);
  }

  return null;
};
