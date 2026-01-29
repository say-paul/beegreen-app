/**
 * MQTT Utilities Module
 * 
 * Provides shared MQTT subscription utilities for per-device topic management.
 * Used by SchedulerPage and ControlPage for ACL-compatible subscriptions.
 * 
 * Exports:
 * - subscribeToDevice: Subscribe to topics for a single device
 * - unsubscribeFromDevice: Unsubscribe from topics for a single device
 * - subscribeToDevices: Subscribe to topics for multiple devices
 * - unsubscribeFromDevices: Unsubscribe from topics for multiple devices
 * - parseDeviceIdFromTopic: Extract device ID from topic string
 * - parseTopicSuffix: Extract topic suffix from topic string
 * - parseDeviceStatus: Parse online/offline status from message
 * - buildTopic: Build topic string from device ID and suffix
 * - SCHEDULER_TOPICS: Topic suffixes for scheduler page
 * - CONTROLLER_TOPICS: Topic suffixes for controller page
 * 
 * Usage:
 * import { subscribeToDevice, SCHEDULER_TOPICS, parseDeviceStatus } from '../services/mqtt';
 * 
 * // Subscribe to a device
 * subscribeToDevice(mqttClient, device.id, SCHEDULER_TOPICS);
 * 
 * // Parse message
 * const isOnline = parseDeviceStatus(message);
 */

export {
  // Subscription functions
  subscribeToDevice,
  unsubscribeFromDevice,
  subscribeToDevices,
  unsubscribeFromDevices,
  
  // Parsing utilities
  parseDeviceIdFromTopic,
  parseTopicSuffix,
  parseDeviceStatus,
  
  // Building utilities
  buildTopic,
  getStatusString,
  
  // Checking utilities
  isDeviceTopic,
  filterDeviceTopics,
  
  // Topic constants
  SCHEDULER_TOPICS,
  CONTROLLER_TOPICS,
  DEVICE_TOPICS,
} from './MqttSubscriptionUtils';
