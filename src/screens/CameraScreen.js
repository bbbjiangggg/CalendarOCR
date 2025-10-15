import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Dimensions } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useEvent } from '../context/EventContext';

const { width, height } = Dimensions.get('window');

export default function CameraScreen({ navigation }) {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
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

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access required</Text>
        <Text style={styles.subText}>Please enable camera access to capture event posters</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing={facing}
        ref={cameraRef}
      >
        <View style={styles.overlay}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.navigate('Landing')}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerText}>Position poster in frame</Text>
            <View style={styles.spacer} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    minWidth: 70,
    backdropFilter: 'blur(20px)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  spacer: {
    minWidth: 70,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 18,
    flex: 1,
    marginHorizontal: 10,
    letterSpacing: -0.4,
    backdropFilter: 'blur(20px)',
  },
  focusArea: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    borderWidth: 2,
    borderColor: '#fff',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
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
    color: '#1D1D1F',
    textAlign: 'center',
    marginTop: 100,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  subText: {
    fontSize: 17,
    color: '#86868B',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 32,
    alignSelf: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
});