/**
 * MqttSubscriptionUtils - Shared MQTT subscription utilities
 * 
 * Provides reusable functions for MQTT topic management:
 * - Subscribe/unsubscribe to device-specific topics
 * - Parse device ID from topic strings
 * - Parse device status from payloads
 * 
 * Used by SchedulerPage and ControlPage for per-device subscriptions
 * without using wildcards (for ACL-enabled MQTT brokers).
 * 
 * Usage:
 * import { subscribeToDevice, unsubscribeFromDevice, parseDeviceStatus } from '../services/mqtt';
 * 
 * // Subscribe to a device's topics
 * subscribeToDevice(mqttClient, 'deviceId', ['status', 'pump_status']);
 * 
 * // Parse incoming message
 * const isOnline = parseDeviceStatus(message);
 */

import { parseStringPayload } from '../../components/tools';

/**
 * Topic suffixes for scheduler page
 */
export const SCHEDULER_TOPICS = [
  'status',
  'get_schedules_response',
  'next_schedule_due',
];

/**
 * Topic suffixes for controller page
 */
export const CONTROLLER_TOPICS = [
  'status',
  'pump_status',
];

/**
 * Topic suffixes for device page (version only)
 */
export const DEVICE_TOPICS = [
  'version',
];

/**
 * Subscribe to topics for a single device
 * @param {Object} client - MQTT client instance (Paho.Client)
 * @param {string} deviceId - Device ID to subscribe for
 * @param {string[]} topicSuffixes - Array of topic suffixes (e.g., ['status', 'pump_status'])
 * @returns {boolean} - True if all subscriptions initiated
 */
export const subscribeToDevice = (client, deviceId, topicSuffixes) => {
  if (!client || !deviceId || !topicSuffixes?.length) {
    console.warn('MqttSubscriptionUtils: Invalid parameters for subscribeToDevice');
    return false;
  }

  try {
    topicSuffixes.forEach(suffix => {
      const topic = `${deviceId}/${suffix}`;
      client.subscribe(topic);
      console.log(`MqttSubscriptionUtils: Subscribed to ${topic}`);
    });
    return true;
  } catch (err) {
    console.error('MqttSubscriptionUtils: Error subscribing to device topics:', err);
    return false;
  }
};

/**
 * Unsubscribe from topics for a single device
 * @param {Object} client - MQTT client instance (Paho.Client)
 * @param {string} deviceId - Device ID to unsubscribe from
 * @param {string[]} topicSuffixes - Array of topic suffixes
 * @returns {boolean} - True if all unsubscriptions initiated
 */
export const unsubscribeFromDevice = (client, deviceId, topicSuffixes) => {
  if (!client || !deviceId || !topicSuffixes?.length) {
    console.warn('MqttSubscriptionUtils: Invalid parameters for unsubscribeFromDevice');
    return false;
  }

  try {
    topicSuffixes.forEach(suffix => {
      const topic = `${deviceId}/${suffix}`;
      client.unsubscribe(topic);
      console.log(`MqttSubscriptionUtils: Unsubscribed from ${topic}`);
    });
    return true;
  } catch (err) {
    console.error('MqttSubscriptionUtils: Error unsubscribing from device topics:', err);
    return false;
  }
};

/**
 * Subscribe to topics for multiple devices
 * @param {Object} client - MQTT client instance (Paho.Client)
 * @param {Object[]} devices - Array of device objects with 'id' property
 * @param {string[]} topicSuffixes - Array of topic suffixes
 * @returns {number} - Number of devices successfully subscribed
 */
export const subscribeToDevices = (client, devices, topicSuffixes) => {
  if (!client || !devices?.length || !topicSuffixes?.length) {
    return 0;
  }

  let successCount = 0;
  devices.forEach(device => {
    if (device?.id && subscribeToDevice(client, device.id, topicSuffixes)) {
      successCount++;
    }
  });

  console.log(`MqttSubscriptionUtils: Subscribed to ${successCount}/${devices.length} devices`);
  return successCount;
};

/**
 * Unsubscribe from topics for multiple devices
 * @param {Object} client - MQTT client instance (Paho.Client)
 * @param {Object[]} devices - Array of device objects with 'id' property
 * @param {string[]} topicSuffixes - Array of topic suffixes
 * @returns {number} - Number of devices successfully unsubscribed
 */
export const unsubscribeFromDevices = (client, devices, topicSuffixes) => {
  if (!client || !devices?.length || !topicSuffixes?.length) {
    return 0;
  }

  let successCount = 0;
  devices.forEach(device => {
    if (device?.id && unsubscribeFromDevice(client, device.id, topicSuffixes)) {
      successCount++;
    }
  });

  console.log(`MqttSubscriptionUtils: Unsubscribed from ${successCount}/${devices.length} devices`);
  return successCount;
};

/**
 * Parse device ID from incoming topic
 * Topic format: "{deviceId}/{topicSuffix}" (e.g., "4FDFF1-DFF1/status")
 * @param {string} topic - Full topic string
 * @returns {string|null} - Device ID or null if invalid format
 */
export const parseDeviceIdFromTopic = (topic) => {
  if (!topic || typeof topic !== 'string') {
    return null;
  }
  
  const parts = topic.split('/');
  if (parts.length < 2) {
    return null;
  }
  
  return parts[0] || null;
};

/**
 * Parse topic suffix from incoming topic
 * Topic format: "{deviceId}/{topicSuffix}" (e.g., "4FDFF1-DFF1/status")
 * @param {string} topic - Full topic string
 * @returns {string|null} - Topic suffix or null if invalid format
 */
export const parseTopicSuffix = (topic) => {
  if (!topic || typeof topic !== 'string') {
    return null;
  }
  
  const parts = topic.split('/');
  if (parts.length < 2) {
    return null;
  }
  
  return parts.slice(1).join('/') || null;
};

/**
 * Parse online/offline status from MQTT message payload
 * Uses parseStringPayload to handle JSON format {"payload":"online","timestamp":"..."}
 * Falls back to plain text parsing if not JSON
 * @param {Object} message - MQTT message object with payloadString property
 * @returns {boolean} - True if online, false if offline
 */
export const parseDeviceStatus = (message) => {
  if (!message) {
    return false;
  }

  const payloadStr = (message.payloadString || '').trim();
  
  // Use parseStringPayload for JSON format {"payload":"online","timestamp":"..."}
  const extracted = parseStringPayload(payloadStr);
  if (extracted) {
    return extracted.toLowerCase() === 'online';
  }
  
  // Plain text fallback
  return payloadStr.toLowerCase() === 'online';
};

/**
 * Get status string from boolean
 * @param {boolean} isOnline - Online status
 * @returns {string} - 'online' or 'offline'
 */
export const getStatusString = (isOnline) => {
  return isOnline ? 'online' : 'offline';
};

/**
 * Build topic string from device ID and suffix
 * @param {string} deviceId - Device ID
 * @param {string} suffix - Topic suffix
 * @returns {string} - Full topic string
 */
export const buildTopic = (deviceId, suffix) => {
  return `${deviceId}/${suffix}`;
};

/**
 * Check if a topic belongs to a specific device
 * @param {string} topic - Full topic string
 * @param {string} deviceId - Device ID to check
 * @returns {boolean} - True if topic belongs to the device
 */
export const isDeviceTopic = (topic, deviceId) => {
  if (!topic || !deviceId) {
    return false;
  }
  return topic.startsWith(`${deviceId}/`);
};

/**
 * Filter topics that belong to a specific device
 * @param {string[]} topics - Array of topic strings
 * @param {string} deviceId - Device ID to filter by
 * @returns {string[]} - Filtered topics
 */
export const filterDeviceTopics = (topics, deviceId) => {
  if (!topics?.length || !deviceId) {
    return [];
  }
  return topics.filter(topic => isDeviceTopic(topic, deviceId));
};
