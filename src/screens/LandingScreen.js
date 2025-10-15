import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEvent } from '../context/EventContext';

export default function LandingScreen({ navigation }) {
  const { dispatch } = useEvent();

  const handleTakePicture = () => {
    // Clear any existing state before navigating
    dispatch({ type: 'RESET_EVENT' });
    navigation.navigate('Camera');
  };

  const handleUploadPicture = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
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
    backgroundColor: '#FFFFFF',
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
    color: '#1D1D1F',
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '400',
    color: '#86868B',
    textAlign: 'center',
    lineHeight: 22,
  },
  actionsSection: {
    gap: 16,
    marginBottom: 60,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  secondaryButton: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1D1D1F',
    letterSpacing: -0.4,
  },
  buttonSubtext: {
    fontSize: 13,
    fontWeight: '400',
    color: '#86868B',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: -0.1,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#86868B',
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
});