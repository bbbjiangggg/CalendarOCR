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
  Platform,
  Keyboard
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useEvent } from '../context/EventContext';
import { extractAndParseEvent, OCR_ERROR } from '../utils/ocrService';
import { saveEventToCalendar } from '../utils/calendarService';
import { incrementScanCount, getRemainingScans } from '../utils/purchaseService';
import { log, error as logError } from '../utils/logger';
import SuccessAnimation from '../components/SuccessAnimation';
import AnalyzingLoader from '../components/AnalyzingLoader';

export default function EventEditorScreen({ navigation }) {
  const { state, dispatch } = useEvent();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDurationValue, setCustomDurationValue] = useState(15); // Default to 15 minutes
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [processError, setProcessError] = useState(null);
  const [stage, setStage] = useState('analyzing'); // live OCR pipeline stage for the loader
  // Success celebration overlay. `success.next` runs after the animation finishes.
  const [success, setSuccess] = useState(null); // { mode, title, next }

  useEffect(() => {
    if (state.capturedImage) {
      log('New image detected, processing...');
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
    try {
      log('Starting image processing...');
      setProcessError(null);
      setStage('analyzing');
      dispatch({ type: 'SET_PROCESSING', payload: true });

      const uri = state.capturedImage?.uri;
      if (!uri) {
        throw Object.assign(new Error('No image was captured.'), { type: OCR_ERROR.INVALID });
      }

      // Race the pipeline against a timeout so a stalled request can't hang the UI.
      const parsedEvents = await Promise.race([
        extractAndParseEvent(uri, setStage),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(Object.assign(
              new Error('This is taking longer than expected. Please try again.'),
              { type: OCR_ERROR.NETWORK }
            )),
            25000
          )
        )
      ]);
      log('Event extraction completed');

      if (!Array.isArray(parsedEvents) || parsedEvents.length === 0) {
        throw Object.assign(
          new Error("We couldn't find an event on this poster."),
          { type: OCR_ERROR.NO_TEXT }
        );
      }

      dispatch({ type: 'SET_MULTIPLE_EVENTS', payload: parsedEvents });
      log(`Event data set successfully - ${parsedEvents.length} event(s) found`);
    } catch (err) {
      logError('Processing error:', err.message);
      setProcessError({
        type: err.type || OCR_ERROR.INVALID,
        message: err.message || 'Something went wrong reading this poster.',
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  // Retry the OCR pipeline on the same captured image.
  const handleRetry = () => {
    if (state.capturedImage?.uri) {
      processImage();
    } else {
      navigation.navigate('Camera');
    }
  };

  // Runs once the success animation finishes: perform the deferred navigation.
  const handleSuccessComplete = () => {
    const next = success && success.next;
    setSuccess(null);
    if (next) next();
  };

  // Let the user skip OCR and fill in a blank event by hand.
  const handleManualEntry = () => {
    setProcessError(null);
    dispatch({
      type: 'SET_MULTIPLE_EVENTS',
      payload: [{
        title: '',
        date: new Date(),
        location: '',
        description: '',
        duration: '60',
        notification: '1hr',
      }],
    });
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

  const handleCustomDurationChange = (event, selectedDuration) => {
    // For countdown mode, extract hours and minutes from LOCAL time (not UTC)
    // This avoids timezone conversion issues that corrupt the duration
    if (selectedDuration) {
      const hours = selectedDuration.getHours();
      const minutes = selectedDuration.getMinutes();
      const durationInMinutes = hours * 60 + minutes;
      log(`Custom duration selected: ${hours}h ${minutes}m = ${durationInMinutes} minutes`);
      setCustomDurationValue(Math.max(1, durationInMinutes)); // Ensure at least 1 minute
    }
  };

  const handleCustomDurationDone = () => {
    // Commit the buffered value to event state when Done is tapped
    log('Committing custom duration:', customDurationValue);
    handleFieldUpdate('duration', customDurationValue.toString());
    setShowCustomDuration(false);
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
        const savedTitle = currentEvent.title;
        // Remove the saved event from the array
        const updatedEvents = state.events.filter((_, idx) => idx !== state.currentEventIndex);

        if (updatedEvents.length > 0) {
          // More events to review — brief celebration, then advance to the next.
          const newIndex = state.currentEventIndex >= updatedEvents.length
            ? updatedEvents.length - 1
            : state.currentEventIndex;

          setSuccess({
            mode: 'brief',
            title: savedTitle,
            next: () => {
              dispatch({ type: 'SET_MULTIPLE_EVENTS', payload: updatedEvents });
              dispatch({ type: 'SELECT_EVENT', payload: newIndex });
              setCurrentPage(newIndex);
            },
          });
        } else {
          // Last event saved — full celebration, then fade home for the next input.
          setSuccess({
            mode: 'full',
            title: savedTitle,
            next: () => {
              dispatch({ type: 'RESET_EVENT' });
              navigation.navigate('Landing');
            },
          });
        }
      }
    } catch (error) {
      logError('Save error:', error);
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
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
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
        <View style={styles.durationGrid}>
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
            value="120"
            label="2 hours"
            selected={event.duration === '120'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="1440"
            label="All day"
            selected={event.duration === '1440'}
            onPress={(value) => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              handleFieldUpdate('duration', value);
            }}
          />
          <NotificationOption
            value="custom"
            label="Custom"
            selected={event.duration && !['15', '30', '60', '120', '1440'].includes(event.duration)}
            onPress={() => {
              dispatch({ type: 'SELECT_EVENT', payload: index });
              // Initialize local state with current duration, default to 15 minutes
              const currentDuration = parseInt(event.duration || '15');
              setCustomDurationValue(currentDuration);
              setShowCustomDuration(true);
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
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
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

    // Add haptic feedback when page changes
    if (pageIndex !== currentPage) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Ignore haptics errors (e.g., on devices without haptic support)
      });
    }

    setCurrentPage(pageIndex);
    dispatch({ type: 'SELECT_EVENT', payload: pageIndex });
  };

  if (state.isProcessing) {
    return <AnalyzingLoader stage={stage} />;
  }

  if (processError) {
    const errorContent = {
      [OCR_ERROR.NETWORK]: { emoji: '📡', title: 'Connection problem' },
      [OCR_ERROR.SERVER]: { emoji: '🛠️', title: 'Server hiccup' },
      [OCR_ERROR.NO_TEXT]: { emoji: '🔍', title: 'No event found' },
      [OCR_ERROR.INVALID]: { emoji: '📷', title: "Couldn't read this poster" },
    }[processError.type] || { emoji: '📷', title: "Couldn't read this poster" };

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>{errorContent.emoji}</Text>
        <Text style={styles.errorTitle}>{errorContent.title}</Text>
        <Text style={styles.errorMessage}>{processError.message}</Text>

        <View style={styles.errorActions}>
          <TouchableOpacity
            style={styles.errorPrimaryButton}
            onPress={handleRetry}
            activeOpacity={0.8}
          >
            <Text style={styles.errorPrimaryText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.errorSecondaryButton}
            onPress={handleManualEntry}
            activeOpacity={0.7}
          >
            <Text style={styles.errorSecondaryText}>Enter Manually</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.errorBackButton}
          onPress={() => navigation.navigate('Landing')}
          activeOpacity={0.7}
        >
          <Text style={styles.errorBackText}>Back to Home</Text>
        </TouchableOpacity>
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
            keyboardDismissMode="on-drag"
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

      {/* Custom Duration Picker */}
      {showCustomDuration && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={handleCustomDurationDone}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={(() => {
                // Convert minutes to local Date with hours/minutes components
                // This avoids timezone issues (Jan 1, 1970 is arbitrary base date)
                const hours = Math.floor(customDurationValue / 60);
                const minutes = customDurationValue % 60;
                return new Date(1970, 0, 1, hours, minutes, 0, 0);
              })()}
              mode="countdown"
              display="spinner"
              onChange={handleCustomDurationChange}
              minuteInterval={15}
            />
          </View>
        </View>
      )}

      {/* Success celebration overlay (renders above everything) */}
      <SuccessAnimation
        visible={!!success}
        mode={success ? success.mode : 'full'}
        title={success ? success.title : ''}
        onComplete={handleSuccessComplete}
      />
    </View>
  );
}

const { width: screenWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 40,
  },
  errorEmoji: {
    fontSize: 52,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.2,
    marginBottom: 36,
  },
  errorActions: {
    width: '100%',
    gap: 12,
  },
  errorPrimaryButton: {
    backgroundColor: '#000000',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorPrimaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  errorSecondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  errorSecondaryText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  errorBackButton: {
    marginTop: 24,
    padding: 8,
  },
  errorBackText: {
    color: '#6B6B6B',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
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
  durationGrid: {
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
    minWidth: '30%',
    alignItems: 'center',
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D0D0',
    marginHorizontal: 5,
  },
  activeIndicator: {
    width: 24,
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