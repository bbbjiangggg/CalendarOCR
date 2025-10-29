import React, { useState, useEffect } from 'react';
import {
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEvent } from '../context/EventContext';
import { extractAndParseEvent } from '../utils/ocrService';
import { saveEventToCalendar } from '../utils/calendarService';
import { incrementScanCount, getRemainingScans } from '../utils/purchaseService';

export default function EventEditorScreen({ navigation }) {
  const { state, dispatch } = useEvent();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (state.capturedImage) {
      console.log('New image detected, processing...');
      processImage();
    }
    
    return () => {
      // Cleanup image data when component unmounts
      if (state.capturedImage) {
        dispatch({ type: 'CLEAR_IMAGE' });
      }
    };
  }, [state.capturedImage]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Clear processing state when app goes to background
        dispatch({ type: 'SET_PROCESSING', payload: false });
      }
    };

    const subscription = require('react-native').AppState?.addEventListener?.(
      'change',
      handleAppStateChange
    );
    
    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []);

  const processImage = async () => {
    let timeoutId;
    try {
      console.log('Starting image processing...');
      dispatch({ type: 'SET_PROCESSING', payload: true });
      
      // Set a timeout to prevent infinite processing
      timeoutId = setTimeout(() => {
        throw new Error('Image processing timeout');
      }, 30000); // 30 second timeout
      
      console.log('Captured image data:', state.capturedImage);
      console.log('Image URI:', state.capturedImage?.uri);
      
      if (!state.capturedImage?.uri) {
        throw new Error('No image URI available');
      }
      
      // Validate the image URI format
      const uri = state.capturedImage.uri;
      if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('assets-library://')) {
        console.warn('Unexpected image URI format:', uri);
      }
      
      console.log('Calling GPT-powered event extraction pipeline...');
      const parsedEvents = await Promise.race([
        extractAndParseEvent(uri),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Event extraction timeout')), 25000)
        )
      ]);
      console.log('Event extraction completed');

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Validate parsed events
      if (!Array.isArray(parsedEvents) || parsedEvents.length === 0) {
        throw new Error('No valid events found in image');
      }
      
      // parseEventDetails now returns an array of events
      dispatch({ type: 'SET_MULTIPLE_EVENTS', payload: parsedEvents });
      console.log(`Event data set successfully - ${parsedEvents.length} event(s) found`);
      
    } catch (error) {
      console.error('Processing error:', error);
      console.error('Error details:', error.message);
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Create fallback event
      const fallbackEvent = [{
        title: 'Manual Entry Required',
        date: new Date(),
        location: '',
        description: 'Please enter event details manually',
        notification: '1hr'
      }];
      
      dispatch({ type: 'SET_MULTIPLE_EVENTS', payload: fallbackEvent });
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to process image' });
      
      Alert.alert(
        'Image Processing Failed', 
        'Could not extract text from image. Please enter event details manually.',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleFieldUpdate = (field, value) => {
    dispatch({ type: 'UPDATE_FIELD', field, value });
  };

  const currentEvent = state.events[state.currentEventIndex] || state.events[0];

  const handleDateChange = (event, selectedDate) => {
    // Don't close the picker on change - only update the date
    if (selectedDate) {
      const newDate = new Date(currentEvent.date);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      handleFieldUpdate('date', newDate);
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    // Don't close the picker on change - only update the time
    if (selectedTime) {
      const newDate = new Date(currentEvent.date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      handleFieldUpdate('date', newDate);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSaveEvent = async () => {
    if (!currentEvent.title.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    try {
      setIsSaving(true);

      // Check scan limit before saving
      const canSave = await incrementScanCount();

      if (!canSave) {
        // User has reached scan limit - show upgrade screen
        const remaining = await getRemainingScans();
        setIsSaving(false);
        navigation.navigate('Upgrade', { remainingScans: remaining });
        return;
      }

      // Save event to calendar
      const success = await saveEventToCalendar(currentEvent);

      if (success) {
        Alert.alert(
          'Success',
          'Event saved to calendar!',
          [
            {
              text: 'OK',
              onPress: () => {
                dispatch({ type: 'RESET_EVENT' });
                navigation.navigate('Landing');
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save event to calendar');
    } finally {
      setIsSaving(false);
    }
  };

  const NotificationOption = ({ value, label, selected, onPress }) => (
    <TouchableOpacity 
      style={[styles.notificationPill, selected && styles.selectedPill]}
      onPress={() => onPress(value)}
    >
      <Text style={[styles.pillText, selected && styles.selectedPillText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderEventCard = (event, index) => (
    <View key={index} style={styles.eventCard}>
      {/* Event Title */}
      <View style={styles.cardSection}>
        <TextInput
          style={styles.titleInput}
          value={event.title}
          onChangeText={(value) => handleFieldUpdate('title', value)}
          placeholder="Event Title"
          placeholderTextColor="#999"
          multiline
        />
      </View>

      {/* Date & Time Section */}
      <View style={styles.cardSection}>
        <View style={styles.dateTimeRow}>
          <View style={styles.dateTimeItem}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                dispatch({ type: 'SELECT_EVENT', payload: index });
                setShowDatePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dateTimeValue}>
                {formatDate(event.date)}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dateTimeItem}>
            <Text style={styles.sectionLabel}>Time</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                dispatch({ type: 'SELECT_EVENT', payload: index });
                setShowTimePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dateTimeValue}>
                {formatTime(event.date)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Duration Section */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionLabel}>Duration</Text>
        <View style={styles.pillsContainer}>
          <NotificationOption
            value="15"
            label="15 min"
            selected={event.duration === '15'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="30"
            label="30 min"
            selected={event.duration === '30'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="60"
            label="1 hour"
            selected={event.duration === '60'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="90"
            label="1.5 hours"
            selected={event.duration === '90'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="120"
            label="2 hours"
            selected={event.duration === '120'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
        </View>
      </View>

      {/* Location Section */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionLabel}>Location</Text>
        <TextInput
          style={styles.locationInput}
          value={event.location}
          onChangeText={(value) => {
            dispatch({ type: 'SELECT_EVENT', payload: index });
            handleFieldUpdate('location', value);
          }}
          placeholder="Add location"
          placeholderTextColor="#999"
        />
      </View>

      {/* Description Section */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.descriptionInput}
          value={event.description}
          onChangeText={(value) => {
            dispatch({ type: 'SELECT_EVENT', payload: index });
            handleFieldUpdate('description', value);
          }}
          placeholder="Add notes (optional)"
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Reminder Section */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionLabel}>Reminder</Text>
        <View style={styles.pillsContainer}>
          <NotificationOption
            value="none"
            label="None"
            selected={event.notification === 'none'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('notification', value);
            }}
          />
          <NotificationOption
            value="10min"
            label="10 min"
            selected={event.notification === '10min'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('notification', value);
            }}
          />
          <NotificationOption
            value="1hr"
            label="1 hour"
            selected={event.notification === '1hr'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('notification', value);
            }}
          />
          <NotificationOption
            value="1day"
            label="1 day"
            selected={event.notification === '1day'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('notification', value);
            }}
          />
        </View>
      </View>
    </View>
  );

  const handleScroll = (event) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const pageIndex = Math.round(contentOffset.x / layoutMeasurement.width);
    setCurrentPage(pageIndex);
    dispatch({ type: 'SELECT_EVENT', payload: pageIndex });
  };

  if (state.isProcessing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Processing image...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.navigate('Landing')}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Event Details</Text>
          {state.events.length > 1 && (
            <Text style={styles.subtitle}>
              {currentPage + 1} of {state.events.length} events
            </Text>
          )}
        </View>
        
        <View style={styles.spacer} />
      </View>

      {/* Cards Container */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.cardsContainer}
        keyboardShouldPersistTaps="handled"
      >
        {state.events.map((event, index) => (
          <ScrollView
            key={index}
            style={styles.cardScrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderEventCard(event, index)}
          </ScrollView>
        ))}
      </ScrollView>

      {/* Page Indicators */}
      {state.events.length > 1 && (
        <View style={styles.pageIndicators}>
          {state.events.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                currentPage === index && styles.activeIndicator
              ]}
            />
          ))}
        </View>
      )}

      {/* Save Button */}
      <View style={styles.saveButtonContainer}>
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSaveEvent}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save to Calendar</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Date Picker */}
      {showDatePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={currentEvent.date}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
            />
          </View>
        </View>
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={currentEvent.date}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const { width: screenWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: '400',
    color: '#6B6B6B',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
    minWidth: 60,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    letterSpacing: -0.4,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  spacer: {
    minWidth: 60,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  cardsContainer: {
    flex: 1,
  },
  cardScrollView: {
    width: screenWidth,
    paddingHorizontal: 24,
  },
  eventCard: {
    backgroundColor: '#FFF0F0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 24,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSection: {
    marginBottom: 24,
  },
  titleInput: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
    minHeight: 40,
    letterSpacing: -0.8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B6B',
    marginBottom: 8,
    letterSpacing: -0.1,
    textTransform: 'uppercase',
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateTimeItem: {
    flex: 1,
    marginHorizontal: 6,
  },
  dateTimeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  dateTimeValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: -0.4,
  },
  locationInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    padding: 16,
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    letterSpacing: -0.4,
  },
  descriptionInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    padding: 16,
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    height: 88,
    textAlignVertical: 'top',
    letterSpacing: -0.4,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  notificationPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  selectedPill: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  pillText: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  selectedPillText: {
    color: '#FFFFFF',
  },
  pageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D0D0D0',
    marginHorizontal: 5,
  },
  activeIndicator: {
    backgroundColor: '#000000',
  },
  saveButtonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: '#FAFAFA',
  },
  saveButton: {
    backgroundColor: '#000000',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#D0D0D0',
  },
  pickerDone: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '600',
  },
});