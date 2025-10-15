import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { EventProvider } from './src/context/EventContext';
import LandingScreen from './src/screens/LandingScreen';
import CameraScreen from './src/screens/CameraScreen';
import EventEditorScreen from './src/screens/EventEditorScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

const Stack = createStackNavigator();

export default function App() {
  return (
    <ErrorBoundary>
      <EventProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Landing"
            screenOptions={{
              headerShown: false,
              gestureEnabled: false,
            }}
          >
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="EventEditor" component={EventEditorScreen} />
          </Stack.Navigator>
          <StatusBar style="light" />
        </NavigationContainer>
      </EventProvider>
    </ErrorBoundary>
  );
}
