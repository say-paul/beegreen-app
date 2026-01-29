/**
 * DeviceSelector - Reusable device selection component
 * 
 * Displays a horizontal scrollable list of device chips with status indicators.
 * Used by SchedulerPage and ControlPage for consistent device selection UI.
 * 
 * Props:
 * - devices: Array of device objects from storage
 * - currentDevice: Currently selected device object (or null)
 * - deviceStatus: Object mapping device IDs to 'online'/'offline' status
 * - onSelectDevice: Callback when a device chip is tapped
 * - title: Optional section title (default: 'Devices')
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

const DeviceSelector = ({
  devices = [],
  currentDevice = null,
  deviceStatus = {},
  onSelectDevice,
  title = 'Devices',
}) => {
  // Check if a specific device is selectable (active and online)
  const isDeviceSelectable = useCallback((device) => {
    if (!device.active) return false;
    return deviceStatus[device.id] === 'online';
  }, [deviceStatus]);

  // Get device chip appearance
  const getDeviceChipStyle = useCallback((device) => {
    const isSelected = currentDevice?.id === device.id;
    const isDisabled = !device.active;
    const isOffline = device.active && deviceStatus[device.id] !== 'online';
    
    return {
      isSelected,
      isDisabled,
      isOffline,
      isSelectable: device.active && deviceStatus[device.id] === 'online',
    };
  }, [currentDevice, deviceStatus]);

  // Get status dot color
  const getStatusDotColor = useCallback((device) => {
    if (!device.active) return '#9CA3AF'; // Gray for disabled
    if (deviceStatus[device.id] === 'online') return '#4CAF50'; // Green for online
    return '#F44336'; // Red for offline
  }, [deviceStatus]);

  // Handle device selection
  const handleSelectDevice = useCallback((device) => {
    if (isDeviceSelectable(device) && onSelectDevice) {
      onSelectDevice(device);
    }
  }, [isDeviceSelectable, onSelectDevice]);

  // Render a single device chip
  const renderDeviceChip = (device) => {
    const chipStyle = getDeviceChipStyle(device);
    const statusColor = getStatusDotColor(device);
    
    return (
      <TouchableOpacity
        key={device.id}
        style={[
          styles.deviceChip,
          chipStyle.isSelected && styles.deviceChipActive,
          chipStyle.isDisabled && styles.deviceChipDisabled,
          chipStyle.isOffline && styles.deviceChipOffline,
        ]}
        onPress={() => handleSelectDevice(device)}
        disabled={!chipStyle.isSelectable}
      >
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text
          style={[
            styles.deviceChipText,
            chipStyle.isSelected && styles.deviceChipTextActive,
            chipStyle.isDisabled && styles.deviceChipTextDisabled,
            chipStyle.isOffline && styles.deviceChipTextOffline,
          ]}
        >
          {device.name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (devices.length === 0) {
    return null;
  }

  return (
    <View style={styles.deviceSection}>
      <Text style={styles.deviceSectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.deviceScrollView}
      >
        {devices.map(renderDeviceChip)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  deviceChip: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deviceChipActive: {
    backgroundColor: '#5E72E4',
    borderColor: '#5E72E4',
  },
  deviceChipDisabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
    opacity: 0.6,
  },
  deviceChipOffline: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F44336',
  },
  deviceChipText: {
    color: '#5E72E4',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  deviceChipTextActive: {
    color: 'white',
  },
  deviceChipTextDisabled: {
    color: '#9CA3AF',
  },
  deviceChipTextOffline: {
    color: '#DC2626',
  },
  deviceScrollView: {
    flexDirection: 'row',
  },
  deviceSection: {
    backgroundColor: 'white',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  deviceSectionTitle: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
});

export default DeviceSelector;
