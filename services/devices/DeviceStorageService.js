/**
 * DeviceStorageService - Secure device storage service
 * 
 * Storage Features:
 * - Uses expo-secure-store for encrypted storage
 * - Manages BeeGreen device registry
 * - Supports CRUD operations for devices
 * - Auto-generates friendly device names (beegreen-1, beegreen-2, etc.)
 * 
 * Storage Structure:
 * Key: 'beegreen_devices'
 * Value: JSON array of device objects
 *        [{ id, name, firmwareVersion, active, addedAt }, ...]
 */

import * as SecureStore from 'expo-secure-store';

// Storage key for devices
const DEVICES_STORAGE_KEY = 'beegreen_devices';

/**
 * Error types for consistent error handling
 */
export const DeviceStorageError = {
  STORAGE_ERROR: 'STORAGE_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
};

/**
 * Device schema type definition (for reference)
 * @typedef {Object} Device
 * @property {string} id - Device ID extracted from WiFi name (e.g., "4FDFF1-DFF1")
 * @property {string} name - User-friendly name (e.g., "beegreen-1")
 * @property {string} firmwareVersion - Firmware version from device
 * @property {boolean} active - Whether device is active (shows in scheduler/controller)
 * @property {number} addedAt - Timestamp when device was added
 */

/**
 * Create a sanitized error (without exposing sensitive data)
 * @param {string} type - Error type from DeviceStorageError
 * @param {string} message - User-safe error message
 * @returns {Error} - Sanitized error object
 */
const createError = (type, message) => {
  const error = new Error(message);
  error.type = type;
  return error;
};

/**
 * Validate device ID input
 * @param {string} id - The device ID to validate
 * @returns {boolean} - True if valid
 */
const isValidDeviceId = (id) => {
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 50;
};

/**
 * Validate device name input
 * @param {string} name - The device name to validate
 * @returns {boolean} - True if valid
 */
const isValidDeviceName = (name) => {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 50;
};

/**
 * Extract device ID from BeeGreen WiFi/device name
 * @param {string} deviceName - Full device name (e.g., "BEEGREEN-4FDFF1-DFF1")
 * @returns {string|null} - Extracted device ID or null if invalid
 */
export const extractDeviceId = (deviceName) => {
  if (!deviceName || typeof deviceName !== 'string') {
    return null;
  }
  // Match BEEGREEN-{alphanumeric}-{alphanumeric} pattern
  // Handles cases like "BEEGREEN-4FDFF1-DFF1" or "BEEGREEN-4FDFF1-DFF1 2"
  const match = deviceName.match(/^BEEGREEN-([A-Za-z0-9]+-[A-Za-z0-9]+)/i);
  return match ? match[1] : null;
};

/**
 * Extract device name from HTML response
 * @param {string} html - HTML content from device page
 * @returns {string|null} - Device name or null if not found
 */
export const extractDeviceNameFromHtml = (html) => {
  if (!html || typeof html !== 'string') {
    return null;
  }
  // Match <h3>BEEGREEN-XXXX-XXXX</h3> pattern
  const match = html.match(/<h3>(BEEGREEN-[A-Za-z0-9]+-[A-Za-z0-9]+)<\/h3>/i);
  return match ? match[1] : null;
};

/**
 * Load all stored devices
 * @returns {Promise<Device[]>} - Array of device objects
 */
const loadDevices = async () => {
  try {
    const stored = await SecureStore.getItemAsync(DEVICES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (err) {
    console.error('DeviceStorageService: Failed to load devices');
    return [];
  }
};

/**
 * Save all devices
 * @param {Device[]} devices - Array of device objects
 * @returns {Promise<boolean>} - True if successful
 */
const saveDevices = async (devices) => {
  try {
    await SecureStore.setItemAsync(DEVICES_STORAGE_KEY, JSON.stringify(devices));
    return true;
  } catch (err) {
    console.error('DeviceStorageService: Failed to save devices');
    return false;
  }
};

/**
 * DeviceStorageService - Main service object
 */
const DeviceStorageService = {
  /**
   * Get all stored devices
   * @returns {Promise<{success: boolean, devices?: Device[], error?: Error}>}
   */
  getDevices: async () => {
    try {
      const devices = await loadDevices();
      return { success: true, devices };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error getting devices');
      return {
        success: false,
        devices: [],
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to retrieve devices'),
      };
    }
  },

  /**
   * Get only active devices
   * @returns {Promise<{success: boolean, devices?: Device[], error?: Error}>}
   */
  getActiveDevices: async () => {
    try {
      const devices = await loadDevices();
      const activeDevices = devices.filter(device => device.active);
      return { success: true, devices: activeDevices };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error getting active devices');
      return {
        success: false,
        devices: [],
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to retrieve active devices'),
      };
    }
  },

  /**
   * Get a device by ID
   * @param {string} id - Device ID
   * @returns {Promise<{success: boolean, device?: Device, error?: Error}>}
   */
  getDevice: async (id) => {
    if (!isValidDeviceId(id)) {
      return {
        success: false,
        error: createError(DeviceStorageError.INVALID_INPUT, 'Invalid device ID provided'),
      };
    }

    try {
      const devices = await loadDevices();
      const device = devices.find(d => d.id === id);
      
      if (!device) {
        return {
          success: false,
          error: createError(DeviceStorageError.NOT_FOUND, 'Device not found'),
        };
      }

      return { success: true, device };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error getting device');
      return {
        success: false,
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to retrieve device'),
      };
    }
  },

  /**
   * Check if a device with the given ID already exists
   * @param {string} id - Device ID
   * @returns {Promise<boolean>}
   */
  deviceExists: async (id) => {
    if (!isValidDeviceId(id)) {
      return false;
    }

    try {
      const devices = await loadDevices();
      return devices.some(d => d.id === id);
    } catch (err) {
      return false;
    }
  },

  /**
   * Generate the next device name (beegreen-N)
   * @returns {Promise<string>}
   */
  generateDeviceName: async () => {
    try {
      const devices = await loadDevices();
      
      // Find the highest numbered device
      let maxNumber = 0;
      devices.forEach(device => {
        const match = device.name.match(/^beegreen-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      });

      return `beegreen-${maxNumber + 1}`;
    } catch (err) {
      console.error('DeviceStorageService: Error generating device name');
      return `beegreen-${Date.now()}`; // Fallback to timestamp
    }
  },

  /**
   * Add a new device
   * @param {Object} deviceData - Device data { id, firmwareVersion }
   * @returns {Promise<{success: boolean, device?: Device, error?: Error}>}
   */
  addDevice: async (deviceData) => {
    const { id, firmwareVersion = 'unknown' } = deviceData;

    if (!isValidDeviceId(id)) {
      return {
        success: false,
        error: createError(DeviceStorageError.INVALID_INPUT, 'Invalid device ID provided'),
      };
    }

    try {
      const devices = await loadDevices();
      
      // Check for duplicate
      if (devices.some(d => d.id === id)) {
        return {
          success: false,
          error: createError(DeviceStorageError.DUPLICATE, 'Device already exists'),
        };
      }

      // Generate friendly name
      const name = await DeviceStorageService.generateDeviceName();

      const newDevice = {
        id: id.trim(),
        name,
        firmwareVersion: firmwareVersion || 'unknown',
        active: true,
        addedAt: Date.now(),
      };

      devices.push(newDevice);
      
      const saved = await saveDevices(devices);
      
      if (!saved) {
        return {
          success: false,
          error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to save device'),
        };
      }

      console.log('DeviceStorageService: Device added successfully:', name);
      
      return { success: true, device: newDevice };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error adding device');
      return {
        success: false,
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to add device'),
      };
    }
  },

  /**
   * Update a device
   * @param {string} id - Device ID
   * @param {Object} updates - Fields to update { name?, firmwareVersion?, active? }
   * @returns {Promise<{success: boolean, device?: Device, error?: Error}>}
   */
  updateDevice: async (id, updates) => {
    if (!isValidDeviceId(id)) {
      return {
        success: false,
        error: createError(DeviceStorageError.INVALID_INPUT, 'Invalid device ID provided'),
      };
    }

    // Validate name if provided
    if (updates.name !== undefined && !isValidDeviceName(updates.name)) {
      return {
        success: false,
        error: createError(DeviceStorageError.INVALID_INPUT, 'Invalid device name provided'),
      };
    }

    try {
      const devices = await loadDevices();
      const deviceIndex = devices.findIndex(d => d.id === id);
      
      if (deviceIndex === -1) {
        return {
          success: false,
          error: createError(DeviceStorageError.NOT_FOUND, 'Device not found'),
        };
      }

      // Apply updates (only allowed fields)
      const allowedUpdates = ['name', 'firmwareVersion', 'active'];
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          devices[deviceIndex][field] = updates[field];
        }
      });

      const saved = await saveDevices(devices);
      
      if (!saved) {
        return {
          success: false,
          error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to update device'),
        };
      }

      console.log('DeviceStorageService: Device updated successfully');
      
      return { success: true, device: devices[deviceIndex] };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error updating device');
      return {
        success: false,
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to update device'),
      };
    }
  },

  /**
   * Set device active status
   * @param {string} id - Device ID
   * @param {boolean} active - Active status
   * @returns {Promise<{success: boolean, device?: Device, error?: Error}>}
   */
  setDeviceActive: async (id, active) => {
    return DeviceStorageService.updateDevice(id, { active: Boolean(active) });
  },

  /**
   * Update device firmware version
   * @param {string} id - Device ID
   * @param {string} firmwareVersion - New firmware version
   * @returns {Promise<{success: boolean, device?: Device, error?: Error}>}
   */
  updateFirmwareVersion: async (id, firmwareVersion) => {
    return DeviceStorageService.updateDevice(id, { firmwareVersion });
  },

  /**
   * Delete a device
   * @param {string} id - Device ID
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  deleteDevice: async (id) => {
    if (!isValidDeviceId(id)) {
      return {
        success: false,
        error: createError(DeviceStorageError.INVALID_INPUT, 'Invalid device ID provided'),
      };
    }

    try {
      const devices = await loadDevices();
      const deviceIndex = devices.findIndex(d => d.id === id);
      
      if (deviceIndex === -1) {
        return {
          success: false,
          error: createError(DeviceStorageError.NOT_FOUND, 'Device not found'),
        };
      }

      devices.splice(deviceIndex, 1);
      
      const saved = await saveDevices(devices);
      
      if (!saved) {
        return {
          success: false,
          error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to delete device'),
        };
      }

      console.log('DeviceStorageService: Device deleted successfully');
      
      return { success: true };
    } catch (err) {
      console.error('DeviceStorageService: Unexpected error deleting device');
      return {
        success: false,
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to delete device'),
      };
    }
  },

  /**
   * Get device count
   * @returns {Promise<number>}
   */
  getDeviceCount: async () => {
    try {
      const devices = await loadDevices();
      return devices.length;
    } catch (err) {
      return 0;
    }
  },

  /**
   * Clear all devices
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  clearAll: async () => {
    try {
      await SecureStore.deleteItemAsync(DEVICES_STORAGE_KEY);
      console.log('DeviceStorageService: All devices cleared');
      return { success: true };
    } catch (err) {
      console.error('DeviceStorageService: Failed to clear devices');
      return {
        success: false,
        error: createError(DeviceStorageError.STORAGE_ERROR, 'Failed to clear devices'),
      };
    }
  },
};

export default DeviceStorageService;
