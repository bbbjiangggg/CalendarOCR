import {
  parseTime,
  calculateDurationBetweenTimes,
  findDurationInText,
  findEndTimeNearStartTime,
  findAllDates,
  findLocationInText,
  parseEventDetails,
} from '../src/utils/eventParsing';

describe('parseTime', () => {
  const t = (m, name = '12-hour') => parseTime(m, name);

  it('parses a 12-hour PM time', () => {
    expect(t(['7:30 PM', '7', '30', 'PM'])).toEqual({ hours: 19, minutes: 30 });
  });

  it('parses a 12-hour AM time', () => {
    expect(t(['9:15 AM', '9', '15', 'AM'])).toEqual({ hours: 9, minutes: 15 });
  });

  it('handles 12 PM as noon (12:00), not 24:00', () => {
    expect(t(['12 PM', '12', undefined, 'PM'])).toEqual({ hours: 12, minutes: 0 });
  });

  it('handles 12 AM as midnight (00:00)', () => {
    expect(t(['12 AM', '12', undefined, 'AM'])).toEqual({ hours: 0, minutes: 0 });
  });

  it('defaults minutes to 0 when absent', () => {
    expect(t(['8 PM', '8', undefined, 'PM'])).toEqual({ hours: 20, minutes: 0 });
  });

  it('parses 24-hour times without meridiem', () => {
    expect(t(['19:00', '19', '00', undefined], '24-hour')).toEqual({ hours: 19, minutes: 0 });
  });

  it('rejects out-of-range hours', () => {
    expect(t(['25:00', '25', '00', undefined], '24-hour')).toBeNull();
  });

  it('rejects out-of-range minutes', () => {
    expect(t(['10:99', '10', '99', undefined], '24-hour')).toBeNull();
  });
});

describe('calculateDurationBetweenTimes', () => {
  it('computes a normal same-day duration', () => {
    expect(
      calculateDurationBetweenTimes({ hours: 19, minutes: 0 }, { hours: 21, minutes: 0 })
    ).toBe(120);
  });

  it('handles events that cross midnight', () => {
    expect(
      calculateDurationBetweenTimes({ hours: 23, minutes: 0 }, { hours: 1, minutes: 0 })
    ).toBe(120);
  });

  it('rejects durations under 5 minutes as invalid (0)', () => {
    expect(
      calculateDurationBetweenTimes({ hours: 10, minutes: 0 }, { hours: 10, minutes: 2 })
    ).toBe(0);
  });

  it('rejects durations over 12 hours as invalid (0)', () => {
    expect(
      calculateDurationBetweenTimes({ hours: 8, minutes: 0 }, { hours: 21, minutes: 0 })
    ).toBe(0);
  });
});

describe('findDurationInText', () => {
  it('reads an explicit hour duration', () => {
    expect(findDurationInText('Doors 7pm. Runs for 2 hours.', null)).toBe('120');
  });

  it('reads a fractional hour duration', () => {
    expect(findDurationInText('Length: 1.5 hours', null)).toBe('90');
  });

  it('reads an explicit minute duration', () => {
    expect(findDurationInText('A quick 45 min talk', null)).toBe('45');
  });

  it('derives duration from a time range using the start time', () => {
    expect(
      findDurationInText('Concert 7:00 PM - 9:00 PM', { hours: 19, minutes: 0 })
    ).toBe('120');
  });

  it('defaults to 60 minutes when nothing is found', () => {
    expect(findDurationInText('No timing information here', null)).toBe('60');
  });
});

describe('findEndTimeNearStartTime', () => {
  it('extracts the end time from a 12-hour range', () => {
    expect(
      findEndTimeNearStartTime('7:00 PM - 9:30 PM', { hours: 19, minutes: 0 })
    ).toEqual({ hours: 21, minutes: 30 });
  });

  it('extracts the end time from a 24-hour range', () => {
    expect(
      findEndTimeNearStartTime('19:00-21:00', { hours: 19, minutes: 0 })
    ).toEqual({ hours: 21, minutes: 0 });
  });
});

describe('findAllDates', () => {
  it('parses a numeric MM/DD/YYYY date', () => {
    const dates = findAllDates('Party on 12/25/2024 at the hall');
    expect(dates.length).toBeGreaterThanOrEqual(1);
    const d = dates[0].date;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(11); // December
    expect(d.getDate()).toBe(25);
  });

  it('parses a written "Month DD, YYYY" date and attaches a nearby time', () => {
    const dates = findAllDates('Gala — December 15, 2024 at 7:00 PM');
    const match = dates.find(x => x.date.getFullYear() === 2024 && x.date.getMonth() === 11);
    expect(match).toBeTruthy();
    expect(match.hasTime).toBe(true);
    expect(match.date.getHours()).toBe(19);
  });

  it('returns no dates when none are present', () => {
    expect(findAllDates('Just some text with no dates').length).toBe(0);
  });
});

describe('findLocationInText', () => {
  it('reads an explicit Location: label', () => {
    expect(findLocationInText('Show tonight\nLocation: Room 101')).toBe('Room 101');
  });

  it('reads a Venue - label', () => {
    expect(findLocationInText('Venue - Blue Note Jazz Club')).toBe('Blue Note Jazz Club');
  });

  it('reads an "@ venue" line', () => {
    expect(findLocationInText('Live music\n@ The Fillmore')).toBe('The Fillmore');
  });

  it('detects a street-address line', () => {
    expect(findLocationInText('Come to 123 Main Street for the show')).toContain('123 Main Street');
  });

  it('returns empty string when no location is found', () => {
    expect(findLocationInText('Nothing location-like here')).toBe('');
  });
});

describe('parseEventDetails (integration)', () => {
  it('always returns a non-empty array', () => {
    expect(Array.isArray(parseEventDetails(''))).toBe(true);
    expect(parseEventDetails('').length).toBeGreaterThan(0);
  });

  it('builds an event from a simple poster', () => {
    const events = parseEventDetails('Summer Concert\n12/25/2024 7:00 PM\nLocation: City Park');
    expect(events.length).toBeGreaterThanOrEqual(1);
    const e = events[0];
    expect(e.title).toBeTruthy();
    expect(e.location).toBe('City Park');
    expect(e.date.getHours()).toBe(19);
  });

  it('falls back to a default event for junk input', () => {
    const events = parseEventDetails('!!!');
    expect(events.length).toBe(1);
    expect(events[0].title).toBeTruthy();
  });
});
