import React, { useEffect, useRef } from 'react';
import { AppState, NativeModules } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { EventProvider, useEvent } from './src/context/EventContext';
import LandingScreen from './src/screens/LandingScreen';
import CameraScreen from './src/screens/CameraScreen';
import EventEditorScreen from './src/screens/EventEditorScreen';
import UpgradeScreen from './src/screens/UpgradeScreen';
import ReferralScreen from './src/screens/ReferralScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initIAP, endIAP, setupPurchaseListener } from './src/utils/purchaseService';
import { log } from './src/utils/logger';

const Stack = createStackNavigator();

// Navigation ref so the Share Extension deep-link handler can route to the
// EventEditor from outside the React tree.
export const navigationRef = createNavigationContainerRef();

// A navigation requested before the navigator was ready (cold start from a
// share). Flushed by handleNavReady once NavigationContainer mounts.
let pendingEditorNav = false;

const navigateToEditor = () => {
  if (navigationRef.isReady()) {
    navigationRef.navigate('EventEditor');
  } else {
    pendingEditorNav = true;
  }
};

const handleNavReady = () => {
  if (pendingEditorNav) {
    pendingEditorNav = false;
    navigationRef.navigate('EventEditor');
  }
};

// Picks up an image shared via the iOS Share Extension. The extension saves it
// to the App Group container; the native PendingShare module copies it into the
// app cache and returns the path. We check on mount (cold start) and every time
// the app becomes active (the extension foregrounds us, or the user opens the
// app manually), then route it through the EXISTING EventEditor pipeline (OCR +
// parsing + paywall all reused). Must be rendered inside EventProvider.
function ShareIntentHandler() {
  const { dispatch } = useEvent();
  const busy = useRef(false);

  useEffect(() => {
    const consume = async () => {
      const mod = NativeModules.PendingShare;
      if (!mod || busy.current) return;
      busy.current = true;
      try {
        const path = await mod.consume();
        if (path) {
          log('Pending shared image picked up');
          // SET_IMAGE triggers EventEditor's existing useEffect([capturedImage]).
          dispatch({ type: 'SET_IMAGE', payload: { uri: `file://${path}` } });
          navigateToEditor();
        }
      } catch (e) {
        log('PendingShare consume failed: ' + (e && e.message ? e.message : e));
      } finally {
        busy.current = false;
      }
    };

    consume(); // cold start / mount
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') consume();
    });

    return () => sub.remove();
  }, [dispatch]);

  return null;
}

// Simple cross-fade transition. Used for the EventEditor screen so that after a
// save, the opaque success overlay fades directly to Landing (no card flash).
const forFade = ({ current }) => ({
  cardStyle: { opacity: current.progress },
});

export default function App() {
  useEffect(() => {
    // Initialize in-app purchases
    initIAP();

    // Set up purchase listener
    const cleanup = setupPurchaseListener();

    // Cleanup on unmount
    return () => {
      cleanup();
      endIAP();
    };
  }, []);

  return (
    <ErrorBoundary>
      <EventProvider>
        <ShareIntentHandler />
        <NavigationContainer ref={navigationRef} onReady={handleNavReady}>
          <Stack.Navigator
            initialRouteName="Landing"
            screenOptions={{
              headerShown: false,
              gestureEnabled: false,
            }}
          >
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen
              name="EventEditor"
              component={EventEditorScreen}
              options={{ cardStyleInterpolator: forFade }}
            />
            <Stack.Screen
              name="Upgrade"
              component={UpgradeScreen}
              options={{
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="Referral"
              component={ReferralScreen}
              options={{
                presentation: 'modal',
              }}
            />
          </Stack.Navigator>
          <StatusBar style="light" />
        </NavigationContainer>
      </EventProvider>
    </ErrorBoundary>
  );
}
