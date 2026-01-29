/**
 * Device Storage Service Module
 * 
 * Provides secure storage and retrieval of BeeGreen devices.
 * Uses expo-secure-store for encrypted storage.
 * 
 * Exports:
 * - DeviceStorageService: Core service for direct usage
 * - useDevices: React hook for component usage
 * - DeviceStorageError: Error type constants
 * - extractDeviceId: Utility to extract device ID from device name
 * - extractDeviceNameFromHtml: Utility to extract device name from HTML response
 * 
 * Usage in components:
 * import { useDevices } from '../services/devices';
 * const { devices, addDevice, setDeviceActive } = useDevices();
 * 
 * Usage outside React:
 * import { DeviceStorageService } from '../services/devices';
 * await DeviceStorageService.addDevice({ id: '4FDFF1-DFF1' });
 */

export { 
  default as DeviceStorageService, 
  DeviceStorageError,
  extractDeviceId,
  extractDeviceNameFromHtml,
} from './DeviceStorageService';

export { default as useDevices } from './useDevices';
