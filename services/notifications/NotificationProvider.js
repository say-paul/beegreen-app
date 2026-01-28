/**
 * NotificationProvider - React Context provider for FCM notifications
 *
 * Wraps the app to provide notification state and automatically
 * handles initialization, permissions, and listeners.
 */
import React, { createContext, useEffect, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { NotificationService } from './NotificationService';
import { TOPICS } from './notificationTypes';

export const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [fcmToken, setFcmToken] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [lastNotification, setLastNotification] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Handle incoming foreground notification
   */
  const handleForegroundNotification = useCallback((message) => {
    setLastNotification({
      ...message,
      receivedAt: new Date().toISOString(),
      state: 'foreground',
    });

    // Show alert for foreground notifications (optional)
    if (message.notification) {
      Alert.alert(message.notification.title || 'Notification', message.notification.body || '');
    }
  }, []);

  /**
   * Handle notification that opened the app
   */
  const handleNotificationOpened = useCallback((message) => {
    setLastNotification({
      ...message,
      receivedAt: new Date().toISOString(),
      state: 'opened',
    });
  }, []);

  /**
   * Initialize FCM and set up listeners
   */
  useEffect(() => {
    let unsubscribeMessage = null;
    let unsubscribeTokenRefresh = null;
    let unsubscribeNotificationOpened = null;

    const initialize = async () => {
      try {
        // Request permission
        const granted = await NotificationService.requestPermission();
        setPermissionStatus(granted ? 'granted' : 'denied');

        if (!granted) {
          console.log('Notification permission not granted');
          setIsInitialized(true);
          return;
        }

        // Get FCM token
        const token = await NotificationService.getToken();
        if (token) {
          setFcmToken(token);
        }

        // Subscribe to default topics
        try {
          await NotificationService.subscribeToTopic(TOPICS.PUMP_EVENTS);
          await NotificationService.subscribeToTopic(TOPICS.DEVICE_STATUS);
        } catch (topicError) {
          console.warn('Failed to subscribe to topics:', topicError);
        }

        // Check for initial notification (app opened from quit state)
        const initialNotification = await NotificationService.getInitialNotification();
        if (initialNotification) {
          setLastNotification({
            ...initialNotification,
            receivedAt: new Date().toISOString(),
            state: 'initial',
          });
        }

        // Set up foreground message listener
        unsubscribeMessage = NotificationService.onMessage(handleForegroundNotification);

        // Set up token refresh listener
        unsubscribeTokenRefresh = NotificationService.onTokenRefresh((newToken) => {
          setFcmToken(newToken);
        });

        // Set up notification opened listener
        unsubscribeNotificationOpened =
          NotificationService.onNotificationOpenedApp(handleNotificationOpened);

        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing notifications:', error);
        setIsInitialized(true);
      }
    };

    initialize();

    // Cleanup listeners on unmount
    return () => {
      if (unsubscribeMessage) unsubscribeMessage();
      if (unsubscribeTokenRefresh) unsubscribeTokenRefresh();
      if (unsubscribeNotificationOpened) unsubscribeNotificationOpened();
    };
  }, [handleForegroundNotification, handleNotificationOpened]);

  /**
   * Manually refresh FCM token
   */
  const refreshToken = useCallback(async () => {
    const token = await NotificationService.getToken();
    if (token) {
      setFcmToken(token);
    }
    return token;
  }, []);

  /**
   * Subscribe to a specific topic
   */
  const subscribeToTopic = useCallback(async (topic) => {
    await NotificationService.subscribeToTopic(topic);
  }, []);

  /**
   * Unsubscribe from a specific topic
   */
  const unsubscribeFromTopic = useCallback(async (topic) => {
    await NotificationService.unsubscribeFromTopic(topic);
  }, []);

  const value = {
    fcmToken,
    permissionStatus,
    lastNotification,
    isInitialized,
    refreshToken,
    subscribeToTopic,
    unsubscribeFromTopic,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
