/**
 * useDevices - React hook for device management
 * 
 * Provides a convenient interface for components to:
 * - Get all devices or active devices only
 * - Add, update, and delete devices
 * - Toggle device active status
 * - Check device existence
 * 
 * Usage:
 * const { devices, addDevice, setDeviceActive, refreshDevices } = useDevices();
 * 
 * // Add a new device
 * await addDevice({ id: '4FDFF1-DFF1', firmwareVersion: '1.0.0' });
 * 
 * // Toggle device active status
 * await setDeviceActive('4FDFF1-DFF1', false);
 */

import { useState, useEffect, useCallback } from 'react';
import DeviceStorageService, { extractDeviceId, extractDeviceNameFromHtml } from './DeviceStorageService';

/**
 * Custom hook for device operations
 * @param {Object} options - Hook options
 * @param {boolean} options.activeOnly - If true, only load active devices
 * @returns {Object} - Object containing device management functions and state
 */
const useDevices = (options = {}) => {
  const { activeOnly = false } = options;
  
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Load devices from storage
   */
  const refreshDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = activeOnly 
        ? await DeviceStorageService.getActiveDevices()
        : await DeviceStorageService.getDevices();
      
      if (result.success) {
        setDevices(result.devices || []);
      } else {
        setError(result.error?.message || 'Failed to load devices');
        setDevices([]);
      }
    } catch (err) {
      setError('Failed to load devices');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  // Load devices on mount
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  /**
   * Add a new device
   * @param {Object} deviceData - Device data { id, firmwareVersion }
   * @returns {Promise<{success: boolean, device?: Object, error?: string}>}
   */
  const addDevice = useCallback(async (deviceData) => {
    const result = await DeviceStorageService.addDevice(deviceData);
    
    if (result.success) {
      // Refresh the device list
      await refreshDevices();
      return { success: true, device: result.device };
    }
    
    return { success: false, error: result.error?.message || 'Failed to add device' };
  }, [refreshDevices]);

  /**
   * Update a device
   * @param {string} id - Device ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{success: boolean, device?: Object, error?: string}>}
   */
  const updateDevice = useCallback(async (id, updates) => {
    const result = await DeviceStorageService.updateDevice(id, updates);
    
    if (result.success) {
      await refreshDevices();
      return { success: true, device: result.device };
    }
    
    return { success: false, error: result.error?.message || 'Failed to update device' };
  }, [refreshDevices]);

  /**
   * Set device active status
   * @param {string} id - Device ID
   * @param {boolean} active - Active status
   * @returns {Promise<boolean>} - True if successful
   */
  const setDeviceActive = useCallback(async (id, active) => {
    const result = await DeviceStorageService.setDeviceActive(id, active);
    
    if (result.success) {
      await refreshDevices();
      return true;
    }
    
    return false;
  }, [refreshDevices]);

  /**
   * Update device firmware version
   * @param {string} id - Device ID
   * @param {string} firmwareVersion - New firmware version
   * @returns {Promise<boolean>} - True if successful
   */
  const updateFirmwareVersion = useCallback(async (id, firmwareVersion) => {
    const result = await DeviceStorageService.updateFirmwareVersion(id, firmwareVersion);
    
    if (result.success) {
      await refreshDevices();
      return true;
    }
    
    return false;
  }, [refreshDevices]);

  /**
   * Delete a device
   * @param {string} id - Device ID
   * @returns {Promise<boolean>} - True if successful
   */
  const deleteDevice = useCallback(async (id) => {
    const result = await DeviceStorageService.deleteDevice(id);
    
    if (result.success) {
      await refreshDevices();
      return true;
    }
    
    return false;
  }, [refreshDevices]);

  /**
   * Get a device by ID
   * @param {string} id - Device ID
   * @returns {Promise<Object|null>} - Device object or null
   */
  const getDevice = useCallback(async (id) => {
    const result = await DeviceStorageService.getDevice(id);
    return result.success ? result.device : null;
  }, []);

  /**
   * Check if a device exists
   * @param {string} id - Device ID
   * @returns {Promise<boolean>}
   */
  const deviceExists = useCallback(async (id) => {
    return await DeviceStorageService.deviceExists(id);
  }, []);

  /**
   * Generate a new device name
   * @returns {Promise<string>}
   */
  const generateDeviceName = useCallback(async () => {
    return await DeviceStorageService.generateDeviceName();
  }, []);

  /**
   * Get device by ID from current state (synchronous)
   * @param {string} id - Device ID
   * @returns {Object|undefined} - Device object or undefined
   */
  const getDeviceFromState = useCallback((id) => {
    return devices.find(d => d.id === id);
  }, [devices]);

  /**
   * Get active devices from current state (synchronous)
   * @returns {Object[]} - Array of active devices
   */
  const getActiveDevicesFromState = useCallback(() => {
    return devices.filter(d => d.active);
  }, [devices]);

  return {
    // State
    devices,
    loading,
    error,
    
    // Async operations
    refreshDevices,
    addDevice,
    updateDevice,
    setDeviceActive,
    updateFirmwareVersion,
    deleteDevice,
    getDevice,
    deviceExists,
    generateDeviceName,
    
    // Sync helpers (from current state)
    getDeviceFromState,
    getActiveDevicesFromState,
    
    // Utility functions (re-exported for convenience)
    extractDeviceId,
    extractDeviceNameFromHtml,
  };
};

export default useDevices;
