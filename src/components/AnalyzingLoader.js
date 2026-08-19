import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';

const { width } = Dimensions.get('window');
const BAR_WIDTH = Math.min(width * 0.7, 320);

// Ordered display steps. Each real pipeline stage maps to one of these; the
// `progress` value is how full the bar is when that step is active.
const STEPS = [
  { key: 'analyzing', label: 'Analyzing image…', progress: 0.28 },
  { key: 'reading', label: 'Reading the text…', progress: 0.52 },
  { key: 'extracting', label: 'Extracting event details…', progress: 0.8 },
  { key: 'organizing', label: 'Almost there…', progress: 0.94 },
];
const STAGE_INDEX = { analyzing: 0, reading: 1, extracting: 2, organizing: 3 };

/**
 * On-brand loading screen shown while a poster is analyzed.
 *
 * A slim pink bar fills as the real pipeline advances (driven by the `stage`
 * prop, which ocrService updates), with a looping shimmer so it never looks
 * frozen during network waits, and a cross-fading status label.
 */
export default function AnalyzingLoader({ stage = 'analyzing' }) {
  const [stepIndex, setStepIndex] = useState(0);
  const progress = useRef(new Animated.Value(0.06)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  // Advance from the real stage prop — but never move backwards.
  useEffect(() => {
    const target = STAGE_INDEX[stage] ?? 0;
    setStepIndex((cur) => Math.max(cur, target));
  }, [stage]);

  // OCR (the first phase) is the longest wait, so after a beat auto-advance the
  // message to "Reading the text…" if the real stage hasn't moved on yet.
  useEffect(() => {
    if (stepIndex !== 0) return undefined;
    const t = setTimeout(() => setStepIndex((cur) => Math.max(cur, 1)), 1500);
    return () => clearTimeout(t);
  }, [stepIndex]);

  // Fill the bar + fade the new label in whenever the step changes.
  useEffect(() => {
    Animated.timing(progress, {
      toValue: STEPS[stepIndex].progress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width isn't native-driver compatible
    }).start();

    textOpacity.setValue(0);
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [stepIndex]);

  // Looping shimmer sweep across the filled portion (skipped under Reduce Motion).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!mounted || reduce) return;
        Animated.loop(
          Animated.timing(shimmer, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          })
        ).start();
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_WIDTH],
  });
  const shimmerX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-70, BAR_WIDTH],
  });

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth }]}>
          <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.label, { opacity: textOpacity }]}>
        {STEPS[stepIndex].label}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 40,
  },
  track: {
    width: BAR_WIDTH,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1DFDF', // soft pink-grey track
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF6B6B', // brand pink
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  label: {
    marginTop: 24,
    fontSize: 16,
    fontWeight: '500',
    color: '#6B6B6B',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
