import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useEvent } from '../context/EventContext';
import { getRemainingScans, incrementScanCount, checkIsPro } from '../utils/purchaseService';
import TutorialOverlay from '../components/TutorialOverlay';

const TUTORIAL_KEY = '@CalendarOCR:tutorialSeen';

export default function LandingScreen({ navigation }) {
  const { dispatch } = useEvent();
  const [remainingScans, setRemainingScans] = useState(-1);
  const [isPro, setIsPro] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    loadScanStatus();
    checkTutorialStatus();
  }, []);

  // Reload scan status when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadScanStatus();
    });
    return unsubscribe;
  }, [navigation]);

  const loadScanStatus = async () => {
    const proStatus = await checkIsPro();
    const remaining = await getRemainingScans();
    setIsPro(proStatus);
    setRemainingScans(remaining);
  };

  const checkTutorialStatus = async () => {
    try {
      const tutorialSeen = await AsyncStorage.getItem(TUTORIAL_KEY);
      if (tutorialSeen !== 'true') {
        // Delay showing tutorial slightly so the landing screen renders first
        setTimeout(() => {
          setShowTutorial(true);
        }, 500);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const handleTutorialComplete = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
      setShowTutorial(false);
    } catch (error) {
      console.error('Error saving tutorial status:', error);
      setShowTutorial(false);
    }
  };

  const checkScanLimit = async () => {
    const canScan = await incrementScanCount();

    if (!canScan) {
      // Show upgrade screen
      const remaining = await getRemainingScans();
      navigation.navigate('Upgrade', { remainingScans: remaining });
      return false;
    }

    return true;
  };

  const handleTakePicture = async () => {
    // Don't check scan limit here - just navigate to camera
    // Limit will be checked when user saves the event
    dispatch({ type: 'RESET_EVENT' });
    navigation.navigate('Camera');
  };

  const handleUploadPicture = async () => {
    try {
      // Don't check scan limit here - just navigate to event editor
      // Limit will be checked when user saves the event

      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library.');
        return;
      }

      // Launch image picker without cropping - user selects full image
      // The app will automatically process the poster area
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,  // Disable cropping UI entirely
        quality: 0.8,  // Higher quality since we're not pre-cropping
      });

      if (!result.canceled) {
        // Clear any existing state and set the selected image
        dispatch({ type: 'RESET_EVENT' });
        dispatch({ type: 'SET_IMAGE', payload: result.assets[0] });
        navigation.navigate('EventEditor');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image from library');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TutorialOverlay
        visible={showTutorial}
        onComplete={handleTutorialComplete}
      />
      <View style={styles.content}>
        {/* App Title */}
        <View style={styles.titleSection}>
          <Text style={styles.appTitle}>CalendarOCR</Text>
          <Text style={styles.subtitle}>
            Turn event posters into calendar events
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleTakePicture}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>Take Picture</Text>
            <Text style={styles.buttonSubtext}>Capture a poster or flyer</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleUploadPicture}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryButtonText}>Choose from Photos</Text>
            <Text style={styles.buttonSubtext}>Select from your library</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {!isPro && remainingScans >= 0 && (
            <TouchableOpacity
              style={styles.proPrompt}
              onPress={() => navigation.navigate('Upgrade', { remainingScans })}
              activeOpacity={0.8}
            >
              <Text style={styles.proPromptText}>
                {remainingScans === 0
                  ? '🔒 No scans left - Upgrade to Pro'
                  : `${remainingScans} free scan${remainingScans === 1 ? '' : 's'} left · Tap for Pro`}
              </Text>
            </TouchableOpacity>
          )}
          {isPro && (
            <Text style={styles.proStatusText}>✓ Pro · Unlimited scans</Text>
          )}
          <Text style={styles.footerText}>
            Automatically detects dates, times, and locations
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 80,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },
  actionsSection: {
    gap: 16,
    marginBottom: 60,
  },
  primaryButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
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
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: -0.4,
  },
  buttonSubtext: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: -0.1,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  proPrompt: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 16,
  },
  proPromptText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  proStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.1,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
});