import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, error as logError } from './logger';

export const requestCalendarPermissions = async () => {
  try {
    if (Platform.OS === 'ios') {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      return status === 'granted';
    } else {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      return status === 'granted';
    }
  } catch (error) {
    logError('Permission request error:', error);
    return false;
  }
};

export const getDefaultCalendar = async () => {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    // Look for the default calendar
    const defaultCalendar = calendars.find(
      cal => cal.source?.name === 'Default' || cal.isPrimary || cal.allowsModifications
    );

    return defaultCalendar || calendars[0];
  } catch (error) {
    logError('Error getting calendars:', error);
    throw error;
  }
};

export const findOrCreateCalendarOCRCalendar = async () => {
  try {
    // Check if we have a cached calendar ID
    const cachedCalendarId = await AsyncStorage.getItem('@calendarocr_calendar_id');

    // Get all calendars
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    // First, try to find existing CalendarOCR calendar by cached ID
    if (cachedCalendarId) {
      const cachedCalendar = calendars.find(cal => cal.id === cachedCalendarId);
      if (cachedCalendar) {
        log('Found cached CalendarOCR calendar:', cachedCalendarId);
        return cachedCalendar;
      }
      // Cached calendar no longer exists (e.g. user deleted it) — drop the stale
      // id so we don't keep referencing it, then fall through to find/create.
      log('Cached calendar no longer exists, clearing stale id');
      await AsyncStorage.removeItem('@calendarocr_calendar_id');
    }

    // Try to find CalendarOCR calendar by title
    const existingCalendar = calendars.find(cal =>
      cal.title === 'CalendarOCR' && cal.allowsModifications
    );

    if (existingCalendar) {
      log('Found existing CalendarOCR calendar:', existingCalendar.id);
      await AsyncStorage.setItem('@calendarocr_calendar_id', existingCalendar.id);
      return existingCalendar;
    }

    // If not found, create a new CalendarOCR calendar
    log('Creating new CalendarOCR calendar...');

    // Get the default source for calendar creation
    let defaultSource;
    if (Platform.OS === 'ios') {
      const sources = await Calendar.getSourcesAsync();
      defaultSource = sources.find(source => source.type === Calendar.SourceType.CALDAV || source.type === Calendar.SourceType.LOCAL);

      if (!defaultSource) {
        defaultSource = sources[0]; // Fallback to first available source
      }
    } else {
      // Android
      const sources = await Calendar.getSourcesAsync();
      defaultSource = sources.find(source => source.type === Calendar.SourceType.LOCAL);

      if (!defaultSource) {
        defaultSource = sources[0];
      }
    }

    if (!defaultSource) {
      throw new Error('No calendar source available for creating calendar');
    }

    // Create the calendar
    const newCalendarId = await Calendar.createCalendarAsync({
      title: 'CalendarOCR',
      color: '#FF6B6B', // Pink/salmon color to match app theme
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultSource.id,
      source: defaultSource,
      name: 'CalendarOCR',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    log('Created new CalendarOCR calendar with ID:', newCalendarId);

    // Cache the new calendar ID
    await AsyncStorage.setItem('@calendarocr_calendar_id', newCalendarId);

    // Retrieve and return the newly created calendar
    const updatedCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const newCalendar = updatedCalendars.find(cal => cal.id === newCalendarId);

    return newCalendar;
  } catch (error) {
    logError('Error finding/creating CalendarOCR calendar:', error);
    // Fallback to default calendar if creation fails
    log('Falling back to default calendar');
    return await getDefaultCalendar();
  }
};

export const saveEventToCalendar = async (eventData) => {
  try {
    // Request permissions first. Note: iOS 17+ splits calendar access into
    // full vs write-only; this app needs FULL access (it creates/enumerates its
    // own "CalendarOCR" calendar). expo-calendar reports anything short of full
    // access as not-granted, so when this fails the fix is almost always to turn
    // on Full Access in Settings — surface that as an actionable, typed error.
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      const err = new Error(
        'CalendarOCR needs Full Access to your calendar to save events. ' +
        'Turn it on in Settings → CalendarOCR → Calendars → Full Access.'
      );
      err.code = 'PERMISSION';
      throw err;
    }

    // Get or create the CalendarOCR calendar
    const calendar = await findOrCreateCalendarOCRCalendar();
    if (!calendar) {
      throw new Error('No calendar available');
    }

    // Calculate notification time
    const alarmOffset = getAlarmOffset(eventData.notification);

    // Calculate end date based on duration (in minutes)
    const durationMinutes = parseInt(eventData.duration) || 60; // Default to 60 minutes
    const endDate = new Date(eventData.date.getTime() + durationMinutes * 60 * 1000);

    // Prepare event details
    const eventDetails = {
      title: eventData.title,
      startDate: eventData.date,
      endDate: endDate,
      location: eventData.location,
      notes: eventData.description,
      calendarId: calendar.id,
      timeZone: calendar.timeZone || 'GMT',
      alarms: alarmOffset !== null ? [{ relativeOffset: alarmOffset }] : [],
    };

    // Create the event
    const eventId = await Calendar.createEventAsync(calendar.id, eventDetails);
    
    log('Event created with ID:', eventId);
    return true;
  } catch (error) {
    logError('Error saving event:', error);
    throw error;
  }
};

const getAlarmOffset = (notificationType) => {
  switch (notificationType) {
    case '10min':
      return -10; // 10 minutes before (negative means before)
    case '1hr':
      return -60; // 1 hour before
    case '1day':
      return -24 * 60; // 1 day before (in minutes)
    case 'none':
    default:
      return null;
  }
};

export const getAvailableCalendars = async () => {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      return [];
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars.filter(cal => cal.allowsModifications);
  } catch (error) {
    logError('Error getting calendars:', error);
    return [];
  }
};