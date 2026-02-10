/**
 * useNotifications - React hook for accessing notification state
 *
 * Use this hook in any component to access FCM token, permission status,
 * and the last received notification.
 */
import { useContext } from 'react';
import { NotificationContext } from './NotificationProvider';

/**
 * Hook to access notification context
 * @returns {{
 *   fcmToken: string|null,
 *   permissionStatus: 'granted'|'denied'|null,
 *   lastNotification: object|null,
 *   isInitialized: boolean,
 *   refreshToken: () => Promise<string|null>,
 *   subscribeToTopic: (topic: string) => Promise<void>,
 *   unsubscribeFromTopic: (topic: string) => Promise<void>
 * }}
 */
export const useNotifications = () => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }

  return context;
};
