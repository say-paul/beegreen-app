/**
 * WiFi Credentials Service Module
 * 
 * Provides secure storage and retrieval of WiFi credentials.
 * Uses expo-secure-store for encrypted storage.
 * 
 * Exports:
 * - WifiCredentialsService: Core service for direct usage
 * - useWifiCredentials: React hook for component usage
 * - WifiCredentialsError: Error type constants
 * 
 * Usage in components:
 * import { useWifiCredentials } from '../services/wifi';
 * const { savePassword, getPassword } = useWifiCredentials();
 * 
 * Usage outside React:
 * import { WifiCredentialsService } from '../services/wifi';
 * await WifiCredentialsService.savePassword(ssid, password);
 */

export { default as WifiCredentialsService, WifiCredentialsError } from './WifiCredentialsService';
export { default as useWifiCredentials } from './useWifiCredentials';
