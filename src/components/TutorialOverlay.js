import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TutorialOverlay({ visible, onComplete }) {
  const [step, setStep] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));

  React.useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleNext = () => {
    if (step < 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  };

  const tutorials = [
    {
      // Step 1: Take Picture button (positioned in center-top area)
      top: SCREEN_HEIGHT * 0.48, // Just below center where "Take Picture" button is
      description: 'Capture event posters with your camera\nAuto-extracts title, time, and location',
    },
    {
      // Step 2: Choose from Photos button (positioned just below Take Picture)
      top: SCREEN_HEIGHT * 0.56, // Below the Take Picture button
      description: 'Or select an existing photo from your library\nWorks with saved posters too',
    },
  ];

  const currentTutorial = tutorials[step];

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        {/* Dark overlay */}
        <View style={styles.darkOverlay} />

        {/* Skip button */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleComplete}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Tutorial content */}
        <View style={[styles.tutorialBox, { top: currentTutorial.top }]}>
          {/* Pointer arrow */}
          <View style={styles.arrow} />

          {/* Description box */}
          <View style={styles.descriptionBox}>
            <Text style={styles.descriptionText}>{currentTutorial.description}</Text>
          </View>
        </View>

        {/* Step indicators */}
        <View style={styles.stepIndicators}>
          {tutorials.map((_, index) => (
            <View
              key={index}
              style={[
                styles.stepDot,
                step === index && styles.activeStepDot,
              ]}
            />
          ))}
        </View>

        {/* Next/Got it button */}
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.9}
        >
          <Text style={styles.nextButtonText}>
            {step < tutorials.length - 1 ? 'Next' : 'Got it!'}
          </Text>
        </TouchableOpacity>

        {/* Tap anywhere hint */}
        <TouchableOpacity
          style={styles.tapArea}
          onPress={handleNext}
          activeOpacity={1}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  tapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 10,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  tutorialBox: {
    position: 'absolute',
    left: 32,
    right: 32,
    alignItems: 'center',
    zIndex: 5,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    marginBottom: -1,
  },
  descriptionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  descriptionText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  stepIndicators: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  activeStepDot: {
    backgroundColor: '#FFFFFF',
    width: 24,
    borderRadius: 3,
  },
  nextButton: {
    position: 'absolute',
    bottom: 80,
    left: 32,
    right: 32,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  nextButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
});
