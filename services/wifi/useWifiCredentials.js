/**
 * useWifiCredentials - React hook for WiFi credentials management
 * 
 * Provides a convenient interface for components to:
 * - Save WiFi credentials after successful device setup
 * - Retrieve saved passwords when selecting a network
 * - Check if credentials exist for auto-fill indication
 * 
 * Usage:
 * const { savePassword, getPassword, hasCredentials } = useWifiCredentials();
 * 
 * // Save after successful setup
 * await savePassword('MyNetwork', 'password123');
 * 
 * // Get password for auto-fill
 * const password = await getPassword('MyNetwork');
 */

import { useCallback } from 'react';
import WifiCredentialsService from './WifiCredentialsService';

/**
 * Custom hook for WiFi credentials operations
 * @returns {Object} - Object containing credential management functions
 */
const useWifiCredentials = () => {
  /**
   * Save password for an SSID
   * @param {string} ssid - Network SSID
   * @param {string} password - Network password
   * @returns {Promise<boolean>} - True if successful
   */
  const savePassword = useCallback(async (ssid, password) => {
    const result = await WifiCredentialsService.savePassword(ssid, password);
    return result.success;
  }, []);

  /**
   * Get saved password for an SSID
   * @param {string} ssid - Network SSID
   * @returns {Promise<string|null>} - Password if found, null otherwise
   */
  const getPassword = useCallback(async (ssid) => {
    const result = await WifiCredentialsService.getPassword(ssid);
    if (result.success && result.password !== undefined) {
      return result.password;
    }
    return null;
  }, []);

  /**
   * Check if credentials exist for an SSID
   * @param {string} ssid - Network SSID
   * @returns {Promise<boolean>}
   */
  const hasCredentials = useCallback(async (ssid) => {
    return await WifiCredentialsService.hasCredentials(ssid);
  }, []);

  /**
   * Delete saved credentials for an SSID
   * @param {string} ssid - Network SSID
   * @returns {Promise<boolean>} - True if successful
   */
  const deletePassword = useCallback(async (ssid) => {
    const result = await WifiCredentialsService.deletePassword(ssid);
    return result.success;
  }, []);

  /**
   * Get list of all saved SSIDs
   * @returns {Promise<string[]>}
   */
  const getSavedSSIDs = useCallback(async () => {
    return await WifiCredentialsService.getSavedSSIDs();
  }, []);

  /**
   * Clear all saved credentials
   * @returns {Promise<boolean>} - True if successful
   */
  const clearAllCredentials = useCallback(async () => {
    const result = await WifiCredentialsService.clearAll();
    return result.success;
  }, []);

  return {
    savePassword,
    getPassword,
    hasCredentials,
    deletePassword,
    getSavedSSIDs,
    clearAllCredentials,
  };
};

export default useWifiCredentials;
