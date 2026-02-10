/**
 * Notification type constants for pump and device events
 */
export const NOTIFICATION_TYPES = {
  PUMP_START: 'pump_start',
  PUMP_STOP: 'pump_stop',
  DEVICE_ONLINE: 'device_online',
  DEVICE_OFFLINE: 'device_offline',
};

/**
 * FCM topic names for subscribing to different event categories
 */
export const TOPICS = {
  PUMP_EVENTS: 'pump_events',
  DEVICE_STATUS: 'device_status',
};

/**
 * Human-readable notification messages for each type
 */
export const NOTIFICATION_MESSAGES = {
  [NOTIFICATION_TYPES.PUMP_START]: {
    title: 'Pump Started',
    body: 'Your irrigation pump has started',
  },
  [NOTIFICATION_TYPES.PUMP_STOP]: {
    title: 'Pump Stopped',
    body: 'Your irrigation pump has stopped',
  },
  [NOTIFICATION_TYPES.DEVICE_ONLINE]: {
    title: 'Device Online',
    body: 'Your device is now connected',
  },
  [NOTIFICATION_TYPES.DEVICE_OFFLINE]: {
    title: 'Device Offline',
    body: 'Your device has disconnected',
  },
};
