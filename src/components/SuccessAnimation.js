import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

// Festive palette that reads well on the brand-pink backdrop.
const CONFETTI_COLORS = ['#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#000000', '#FFFFFF'];
const CONFETTI_COUNT = 18;

/**
 * Full-screen success celebration shown after an event is saved.
 *
 * A checkmark badge springs in while confetti bursts outward, then the whole
 * overlay fades out and calls onComplete() — the fade IS the transition home.
 *
 * Built entirely on React Native's Animated API (native driver) so it needs no
 * extra native dependency. Respects the OS "reduce motion" setting.
 *
 * Props:
 *   visible     – render + play when true
 *   title       – saved event title, shown under the message
 *   onComplete  – called once the animation (or reduced-motion fade) finishes
 *   mode        – 'full' (confetti + longer hold) or 'brief' (quick check pop)
 */
export default function SuccessAnimation({ visible, title, onComplete, mode = 'full' }) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(14)).current;

  // Precompute confetti trajectories once so they don't change between renders.
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + (Math.random() - 0.5) * 0.4;
      const distance = 130 + Math.random() * 150;
      return {
        progress: new Animated.Value(0),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 30, // slight upward bias
        spin: (Math.random() - 0.5) * 720,
        size: 8 + Math.random() * 9,
        delay: Math.random() * 90,
      };
    })
  ).current;

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) onComplete && onComplete();
    };

    const play = async () => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch (e) {
        reduceMotion = false;
      }
      if (cancelled) return;

      // Accessible fallback: a simple fade, no motion.
      if (reduceMotion) {
        checkScale.setValue(1);
        textOpacity.setValue(1);
        textTranslate.setValue(0);
        Animated.sequence([
          Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.delay(700),
          Animated.timing(backdrop, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(finish);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      const showConfetti = mode === 'full';
      const holdMs = mode === 'full' ? 700 : 350;

      Animated.sequence([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.spring(checkScale, {
            toValue: 1,
            friction: 5,
            tension: 120,
            useNativeDriver: true,
          }),
          ...(showConfetti
            ? particles.map((p) =>
                Animated.timing(p.progress, {
                  toValue: 1,
                  duration: 950,
                  delay: p.delay,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                })
              )
            : []),
          Animated.parallel([
            Animated.timing(textOpacity, {
              toValue: 1,
              duration: 320,
              delay: 160,
              useNativeDriver: true,
            }),
            Animated.timing(textTranslate, {
              toValue: 0,
              duration: 320,
              delay: 160,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.delay(holdMs),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 450,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) finish();
      });
    };

    play();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: backdrop }]}>
      {/* Confetti burst (rendered behind the badge, anchored at screen center) */}
      {mode === 'full' &&
        particles.map((p, idx) => {
          const translateX = p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
          const translateY = p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] });
          const rotate = p.progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${p.spin}deg`],
          });
          const opacity = p.progress.interpolate({
            inputRange: [0, 0.7, 1],
            outputRange: [1, 1, 0],
          });
          return (
            <Animated.View
              key={idx}
              style={[
                styles.confetti,
                {
                  width: p.size,
                  height: p.size * 0.6,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                  backgroundColor: p.color,
                  opacity,
                  transform: [{ translateX }, { translateY }, { rotate }],
                },
              ]}
            />
          );
        })}

      <View style={styles.centerColumn}>
        <Animated.View style={[styles.badge, { transform: [{ scale: checkScale }] }]}>
          {/* Geometric checkmark drawn from two strokes — no font glyph / emoji */}
          <View style={styles.checkmark} />
        </Animated.View>

        <Animated.View
          style={{
            opacity: textOpacity,
            transform: [{ translateY: textTranslate }],
            alignItems: 'center',
          }}
        >
          <Text style={styles.message}>Added to Calendar</Text>
          {!!title && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {title}
            </Text>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  centerColumn: {
    alignItems: 'center',
  },
  confetti: {
    position: 'absolute',
    left: width / 2,
    top: height / 2,
    borderRadius: 2,
  },
  badge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  // A checkmark drawn as an "L" (right + bottom borders) rotated 45°.
  checkmark: {
    width: 26,
    height: 48,
    borderColor: '#FFFFFF',
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderBottomRightRadius: 2,
    transform: [{ rotate: '45deg' }],
    marginTop: -6, // optical centering within the badge
  },
  message: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6B6B6B',
    marginTop: 6,
    maxWidth: width * 0.7,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
