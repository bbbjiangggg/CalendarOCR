import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Dimensions, ActivityIndicator } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEvent } from '../context/EventContext';

const { width, height } = Dimensions.get('window');

export default function CameraScreen({ navigation }) {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [zoom, setZoom] = useState(0);
  const cameraRef = useRef(null);
  const { dispatch } = useEvent();

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        dispatch({ type: 'SET_PROCESSING', payload: true });

        const photo = await Promise.race([
          cameraRef.current.takePictureAsync({
            quality: 0.6,
            base64: false,
            skipProcessing: false,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Camera timeout')), 10000)
          )
        ]);

        if (!photo || !photo.uri) {
          throw new Error('Invalid photo captured');
        }

        console.log('Photo captured successfully:', photo.uri);
        dispatch({ type: 'SET_IMAGE', payload: photo });
        navigation.navigate('EventEditor');
      } catch (error) {
        console.error('Error taking picture:', error);
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to capture image' });
        dispatch({ type: 'SET_PROCESSING', payload: false });
        Alert.alert('Camera Error', error.message || 'Failed to capture image. Please try again.');
      }
    } else {
      Alert.alert('Camera Error', 'Camera is not ready. Please try again.');
    }
  };

  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newZoom = Math.min(Math.max(zoom + (event.scale - 1) * 0.02, 0), 1);
      setZoom(newZoom);
    });

  // Automatically request permission when component mounts
  React.useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      // If user previously denied and can't ask again, go back
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in Settings to capture event posters.',
        [{ text: 'OK', onPress: () => navigation.navigate('Landing') }]
      );
    } else if (permission && !permission.granted) {
      // Automatically request permission using native dialog
      requestPermission();
    }
  }, [permission]);

  if (!permission || !permission.granted) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.text}>Preparing camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pinchGesture}>
        <CameraView
          style={styles.camera}
          facing={facing}
          zoom={zoom}
          ref={cameraRef}
        >
          <View style={styles.overlay}>
            {/* Back Button - Top Left */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.navigate('Landing')}
              activeOpacity={0.7}
            >
              <Text style={styles.backButtonText}>✕</Text>
            </TouchableOpacity>

            {/* Instruction Text - Top Center */}
            <View style={styles.instructionContainer}>
              <Text style={styles.instructionText}>Position poster in frame</Text>
            </View>

            <View style={styles.focusArea} />

            <View style={styles.controls}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
              >
                <View style={styles.captureInner} />
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  backButtonText: {
    color: '#000000',
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 24,
  },
  instructionContainer: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    letterSpacing: -0.2,
  },
  focusArea: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backdropFilter: 'blur(20px)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  text: {
    fontSize: 20,
    color: '#000000',
    textAlign: 'center',
    marginTop: 100,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  subText: {
    fontSize: 17,
    color: '#6B6B6B',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  permissionButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
});