import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../services/auth';
import DevicePage from '../components/DevicePage';
import SchedulerPage from '../components/SchedulerPage';
import ControlPage from '../components/ControlPage';
//import TimelinePage from "../components/TimelinePage";
import AccountInfoPage from '../components/AccountInfoPage';
import LoginPage from '../components/LoginPage';

const Drawer = createDrawerNavigator();

/**
 * Loading screen displayed while checking authentication status
 */
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#2E8B57" />
  </View>
);

/**
 * Main app navigator that handles authentication-based routing
 * Uses AuthContext to reactively update when authentication state changes
 */
const AppNavigator = () => {
  const { isLoading, isAuthenticated } = useAuth();

  // Show loading screen while checking authentication status
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Determine initial route based on authentication status
  const initialRoute = isAuthenticated ? 'Device Add' : 'Login';

  return (
    <NavigationContainer>
      <Drawer.Navigator initialRouteName={initialRoute}>
        {isAuthenticated ? (
          <>
            <Drawer.Screen
              name='Device Add'
              component={DevicePage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name='devices' size={size} color={color} />
                ),
              }}
            />

            <Drawer.Screen
              name='Scheduler'
              component={SchedulerPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name='schedule' size={size} color={color} />
                ),
              }}
            />
            <Drawer.Screen
              name='Control'
              component={ControlPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name='settings' size={size} color={color} />
                ),
              }}
            />

            <Drawer.Screen
              name='Account Info'
              component={AccountInfoPage}
              options={{
                drawerIcon: ({ color, size }) => (
                  <MaterialIcons name='account-circle' size={size} color={color} />
                ),
              }}
            />
          </>
        ) : (
          <Drawer.Screen
            name='Login'
            component={LoginPage}
            options={{
              headerShown: false, // Hide header with hamburger icon on login page
              swipeEnabled: false, // Disable swipe to open drawer
            }}
          />
        )}
      </Drawer.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2E8B57',
  },
});

export default AppNavigator;
