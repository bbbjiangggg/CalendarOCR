import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

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
    console.error('Permission request error:', error);
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
    console.error('Error getting calendars:', error);
    throw error;
  }
};

export const saveEventToCalendar = async (eventData) => {
  try {
    // Request permissions first
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      throw new Error('Calendar permission denied');
    }

    // Get the default calendar
    const calendar = await getDefaultCalendar();
    if (!calendar) {
      throw new Error('No calendar available');
    }

    // Calculate notification time
    const alarmOffset = getAlarmOffset(eventData.notification);

    // Prepare event details
    const eventDetails = {
      title: eventData.title,
      startDate: eventData.date,
      endDate: new Date(eventData.date.getTime() + 60 * 60 * 1000), // 1 hour duration
      location: eventData.location,
      notes: eventData.description,
      calendarId: calendar.id,
      timeZone: calendar.timeZone || 'GMT',
      alarms: alarmOffset !== null ? [{ relativeOffset: alarmOffset }] : [],
    };

    // Create the event
    const eventId = await Calendar.createEventAsync(calendar.id, eventDetails);
    
    console.log('Event created with ID:', eventId);
    return true;
  } catch (error) {
    console.error('Error saving event:', error);
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
    console.error('Error getting calendars:', error);
    return [];
  }
};