/**
 * Notifications Module - Public API
 *
 * This is the main entry point for the notifications module.
 * Import what you need from here rather than individual files.
 *
 * @example
 * // In App.js
 * import { NotificationProvider } from './services/notifications';
 *
 * @example
 * // In any component
 * import { useNotifications, NOTIFICATION_TYPES } from '../services/notifications';
 * const { fcmToken, lastNotification } = useNotifications();
 */

// React components and hooks
export { NotificationProvider } from './NotificationProvider';
export { useNotifications } from './useNotifications';

// Standalone service (for non-React usage)
export { NotificationService, isFirebaseAvailable, isRunningInExpoGo } from './NotificationService';

// Constants and types
export { NOTIFICATION_TYPES, TOPICS, NOTIFICATION_MESSAGES } from './notificationTypes';
