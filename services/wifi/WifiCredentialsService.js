/**
 * WifiCredentialsService - Secure WiFi credentials storage service
 * 
 * Security Features:
 * - Uses expo-secure-store which encrypts data using:
 *   - iOS: Keychain Services
 *   - Android: Android Keystore
 * - Passwords are never logged or exposed in error messages
 * - Credentials are stored as encrypted key-value pairs
 * - Service is stateless - no in-memory password caching
 * 
 * Storage Structure:
 * Key: 'wifi_credentials'
 * Value: JSON object mapping SSID to encrypted password
 *        { "MyNetwork": "password123", "OtherNetwork": "pass456" }
 */

import * as SecureStore from 'expo-secure-store';

// Storage key for WiFi credentials
const WIFI_CREDENTIALS_KEY = 'wifi_credentials';

/**
 * Error types for consistent error handling
 */
export const WifiCredentialsError = {
  STORAGE_ERROR: 'STORAGE_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
};

/**
 * Create a sanitized error (without exposing sensitive data)
 * @param {string} type - Error type from WifiCredentialsError
 * @param {string} message - User-safe error message
 * @returns {Error} - Sanitized error object
 */
const createError = (type, message) => {
  const error = new Error(message);
  error.type = type;
  return error;
};

/**
 * Validate SSID input
 * @param {string} ssid - The SSID to validate
 * @returns {boolean} - True if valid
 */
const isValidSSID = (ssid) => {
  return typeof ssid === 'string' && ssid.trim().length > 0 && ssid.length <= 32;
};

/**
 * Validate password input
 * @param {string} password - The password to validate
 * @returns {boolean} - True if valid
 */
const isValidPassword = (password) => {
  return typeof password === 'string' && password.length >= 0 && password.length <= 63;
};

/**
 * Load all stored WiFi credentials
 * @returns {Promise<Object>} - Object mapping SSID to password
 */
const loadCredentials = async () => {
  try {
    const stored = await SecureStore.getItemAsync(WIFI_CREDENTIALS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {};
  } catch (err) {
    // Log error without sensitive data
    console.error('WifiCredentialsService: Failed to load credentials');
    return {};
  }
};

/**
 * Save all WiFi credentials
 * @param {Object} credentials - Object mapping SSID to password
 * @returns {Promise<boolean>} - True if successful
 */
const saveCredentials = async (credentials) => {
  try {
    await SecureStore.setItemAsync(WIFI_CREDENTIALS_KEY, JSON.stringify(credentials));
    return true;
  } catch (err) {
    // Log error without sensitive data
    console.error('WifiCredentialsService: Failed to save credentials');
    return false;
  }
};

/**
 * WifiCredentialsService - Main service object
 */
const WifiCredentialsService = {
  /**
   * Save WiFi credentials for a specific SSID
   * @param {string} ssid - The network SSID
   * @param {string} password - The network password
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  savePassword: async (ssid, password) => {
    // Validate inputs
    if (!isValidSSID(ssid)) {
      return {
        success: false,
        error: createError(WifiCredentialsError.INVALID_INPUT, 'Invalid SSID provided'),
      };
    }

    if (!isValidPassword(password)) {
      return {
        success: false,
        error: createError(WifiCredentialsError.INVALID_INPUT, 'Invalid password provided'),
      };
    }

    try {
      const credentials = await loadCredentials();
      const normalizedSSID = ssid.trim();
      
      // Store the password for this SSID
      credentials[normalizedSSID] = password;
      
      const saved = await saveCredentials(credentials);
      
      if (!saved) {
        return {
          success: false,
          error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to save credentials'),
        };
      }

      // Log success without exposing sensitive data
      console.log('WifiCredentialsService: Credentials saved for network');
      
      return { success: true };
    } catch (err) {
      console.error('WifiCredentialsService: Unexpected error saving credentials');
      return {
        success: false,
        error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to save credentials'),
      };
    }
  },

  /**
   * Retrieve password for a specific SSID
   * @param {string} ssid - The network SSID
   * @returns {Promise<{success: boolean, password?: string, error?: Error}>}
   */
  getPassword: async (ssid) => {
    if (!isValidSSID(ssid)) {
      return {
        success: false,
        error: createError(WifiCredentialsError.INVALID_INPUT, 'Invalid SSID provided'),
      };
    }

    try {
      const credentials = await loadCredentials();
      const normalizedSSID = ssid.trim();
      
      if (normalizedSSID in credentials) {
        return {
          success: true,
          password: credentials[normalizedSSID],
        };
      }

      return {
        success: false,
        error: createError(WifiCredentialsError.NOT_FOUND, 'No saved credentials for this network'),
      };
    } catch (err) {
      console.error('WifiCredentialsService: Unexpected error retrieving credentials');
      return {
        success: false,
        error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to retrieve credentials'),
      };
    }
  },

  /**
   * Check if credentials exist for a specific SSID
   * @param {string} ssid - The network SSID
   * @returns {Promise<boolean>}
   */
  hasCredentials: async (ssid) => {
    if (!isValidSSID(ssid)) {
      return false;
    }

    try {
      const credentials = await loadCredentials();
      const normalizedSSID = ssid.trim();
      return normalizedSSID in credentials;
    } catch (err) {
      return false;
    }
  },

  /**
   * Delete credentials for a specific SSID
   * @param {string} ssid - The network SSID
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  deletePassword: async (ssid) => {
    if (!isValidSSID(ssid)) {
      return {
        success: false,
        error: createError(WifiCredentialsError.INVALID_INPUT, 'Invalid SSID provided'),
      };
    }

    try {
      const credentials = await loadCredentials();
      const normalizedSSID = ssid.trim();
      
      if (!(normalizedSSID in credentials)) {
        return {
          success: false,
          error: createError(WifiCredentialsError.NOT_FOUND, 'No saved credentials for this network'),
        };
      }

      delete credentials[normalizedSSID];
      
      const saved = await saveCredentials(credentials);
      
      if (!saved) {
        return {
          success: false,
          error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to delete credentials'),
        };
      }

      console.log('WifiCredentialsService: Credentials deleted for network');
      
      return { success: true };
    } catch (err) {
      console.error('WifiCredentialsService: Unexpected error deleting credentials');
      return {
        success: false,
        error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to delete credentials'),
      };
    }
  },

  /**
   * Get list of all saved SSIDs (without passwords)
   * @returns {Promise<string[]>}
   */
  getSavedSSIDs: async () => {
    try {
      const credentials = await loadCredentials();
      return Object.keys(credentials);
    } catch (err) {
      console.error('WifiCredentialsService: Failed to get saved SSIDs');
      return [];
    }
  },

  /**
   * Clear all saved WiFi credentials
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  clearAll: async () => {
    try {
      await SecureStore.deleteItemAsync(WIFI_CREDENTIALS_KEY);
      console.log('WifiCredentialsService: All credentials cleared');
      return { success: true };
    } catch (err) {
      console.error('WifiCredentialsService: Failed to clear credentials');
      return {
        success: false,
        error: createError(WifiCredentialsError.STORAGE_ERROR, 'Failed to clear credentials'),
      };
    }
  },
};

export default WifiCredentialsService;
