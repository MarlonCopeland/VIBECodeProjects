// src/components/AnimatedSplash.tsx
// Animated hand-off from the native splash screen into the app. Renders an
// exact copy of the native splash (same image, same background) as a full-
// screen overlay, hides the native splash behind it, then — once the app is
// ready — zooms the mark up slightly while fading the overlay away for a
// smooth, professional reveal instead of a hard cut.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/** Must match `splash.backgroundColor` in app.config.js. */
const SPLASH_BACKGROUND = '#0B0D12';

interface AnimatedSplashProps {
  /** Flip to true when the app behind the overlay is ready to be revealed. */
  ready: boolean;
  /** Called after the reveal animation completes; unmount the overlay then. */
  onDone: () => void;
}

export function AnimatedSplash({ ready, onDone }: AnimatedSplashProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    // Swap the native splash for this identical overlay, then reveal.
    SplashScreen.hideAsync().catch(() => {});
    Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [ready, opacity, scale, onDone]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BACKGROUND, opacity, zIndex: 999 }]}
    >
      <Animated.Image
        source={require('../../assets/splash.png')}
        resizeMode="contain"
        style={{ width: '100%', height: '100%', transform: [{ scale }] }}
      />
    </Animated.View>
  );
}
