/**
 * NotificationService - Standalone FCM operations module
 *
 * This service handles all Firebase Cloud Messaging operations without
 * any React dependencies, making it testable and reusable.
 */
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

export const NotificationService = {
  /**
   * Request notification permission from the user
   * @returns {Promise<boolean>} Whether permission was granted
   */
  async requestPermission() {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Notification permission granted:', authStatus);
      } else {
        console.log('Notification permission denied');
      }

      return enabled;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  },

  /**
   * Get the current FCM device token
   * @returns {Promise<string|null>} The FCM token or null if unavailable
   */
  async getToken() {
    try {
      // For iOS, ensure APNs token is available first
      if (Platform.OS === 'ios') {
        const apnsToken = await messaging().getAPNSToken();
        if (!apnsToken) {
          console.log('APNs token not available yet');
          return null;
        }
      }

      const token = await messaging().getToken();
      console.log('FCM Token retrieved:', token?.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  },

  /**
   * Register a callback for token refresh events
   * @param {Function} callback - Called with new token when refreshed
   * @returns {Function} Unsubscribe function
   */
  onTokenRefresh(callback) {
    return messaging().onTokenRefresh((newToken) => {
      console.log('FCM Token refreshed');
      callback(newToken);
    });
  },

  /**
   * Register a callback for foreground messages
   * @param {Function} callback - Called with message when received in foreground
   * @returns {Function} Unsubscribe function
   */
  onMessage(callback) {
    return messaging().onMessage(async (remoteMessage) => {
      console.log('Foreground message received:', remoteMessage.notification?.title);
      callback(remoteMessage);
    });
  },

  /**
   * Set the background message handler
   * This must be called outside of React component lifecycle
   * @param {Function} handler - Called with message when received in background
   */
  setBackgroundMessageHandler(handler) {
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('Background message received:', remoteMessage.notification?.title);
      return handler(remoteMessage);
    });
  },

  /**
   * Subscribe to an FCM topic
   * @param {string} topic - Topic name to subscribe to
   * @returns {Promise<void>}
   */
  async subscribeToTopic(topic) {
    try {
      await messaging().subscribeToTopic(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Error subscribing to topic ${topic}:`, error);
      throw error;
    }
  },

  /**
   * Unsubscribe from an FCM topic
   * @param {string} topic - Topic name to unsubscribe from
   * @returns {Promise<void>}
   */
  async unsubscribeFromTopic(topic) {
    try {
      await messaging().unsubscribeFromTopic(topic);
      console.log(`Unsubscribed from topic: ${topic}`);
    } catch (error) {
      console.error(`Error unsubscribing from topic ${topic}:`, error);
      throw error;
    }
  },

  /**
   * Check if the app has notification permission
   * @returns {Promise<boolean>}
   */
  async hasPermission() {
    const authStatus = await messaging().hasPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  },

  /**
   * Get the initial notification that opened the app (if any)
   * @returns {Promise<object|null>} The notification or null
   */
  async getInitialNotification() {
    return await messaging().getInitialNotification();
  },

  /**
   * Register a callback for when app is opened from a notification
   * @param {Function} callback - Called with notification data
   * @returns {Function} Unsubscribe function
   */
  onNotificationOpenedApp(callback) {
    return messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('App opened from notification:', remoteMessage.notification?.title);
      callback(remoteMessage);
    });
  },
};
