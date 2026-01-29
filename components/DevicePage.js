import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import Paho from 'paho-mqtt';
import { useAuth } from '../services/auth';
import { useWifiCredentials } from '../services/wifi';
import { useDevices, extractDeviceId, extractDeviceNameFromHtml } from '../services/devices';
import { subscribeToDevice, parseDeviceIdFromTopic, DEVICE_TOPICS } from '../services/mqtt';
import { parseStringPayload } from './tools';

const DevicePage = ({ navigation }) => {
  // Get config from auth context - no need for useEffect to load from SecureStore
  const { config: savedData2, updateConfig } = useAuth();
  
  // WiFi credentials service for password auto-fill
  const { savePassword: saveWifiPassword, getPassword: getSavedWifiPassword } = useWifiCredentials();

  // Device storage service
  const { 
    devices, 
    loading: devicesLoading, 
    addDevice, 
    setDeviceActive, 
    deleteDevice,
    refreshDevices,
    deviceExists,
    updateFirmwareVersion,
    updateDevice,
  } = useDevices();

  // MQTT Connection States
  const [device, setDevice] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // WiFi Configuration States
  const [showAddDevice, setShowAddDevice] = useState(true);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [selectedWifi, setSelectedWifi] = useState(null);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiForm, setShowWifiForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [showMqttPassword, setShowMqttPassword] = useState(false);
  const [showWifiPassword, setShowWifiPassword] = useState(false);

  // Current device being added (extracted from HTTP response)
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  // Device name editing state
  const [editingDevice, setEditingDevice] = useState(null);
  const [editedDeviceName, setEditedDeviceName] = useState('');

  // MQTT client for fetching firmware versions
  const [mqttClient, setMqttClient] = useState(null);
  const subscribedDevicesRef = useRef(new Set());

  // Handle MQTT version messages
  const handleMqttMessage = useCallback((message) => {
    const topic = message.destinationName;
    const deviceId = parseDeviceIdFromTopic(topic);

    if (topic.endsWith('/version') && deviceId) {
      const version = parseStringPayload(message.payloadString);
      if (version) {
        updateFirmwareVersion(deviceId, version);
        console.log(`DevicePage: Updated firmware version for ${deviceId}: ${version}`);
      }
    }
  }, [updateFirmwareVersion]);

  // Subscribe to version topics for active devices
  const subscribeToActiveDeviceVersions = useCallback((client) => {
    if (!client || !client.isConnected()) return;

    const activeDevices = devices.filter(d => d.active);
    
    activeDevices.forEach(device => {
      if (!subscribedDevicesRef.current.has(device.id)) {
        subscribeToDevice(client, device.id, DEVICE_TOPICS);
        subscribedDevicesRef.current.add(device.id);
      }
    });
  }, [devices]);

  // Initialize MQTT connection for firmware version fetching
  useEffect(() => {
    const initializeMqtt = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (!config) return;

      const { mqttServer, mqttPort, mqttUser, mqttPassword } = JSON.parse(config);
      if (!mqttServer) return;

      const client = new Paho.Client(
        mqttServer,
        Number(mqttPort) || 8884,
        `devicePage-${Math.random().toString(36).substr(2, 8)}`
      );

      client.onMessageArrived = handleMqttMessage;

      client.onConnectionLost = (responseObject) => {
        console.log('DevicePage: MQTT connection lost:', responseObject.errorMessage);
      };

      client.connect({
        onSuccess: () => {
          console.log('DevicePage: MQTT connected for firmware versions');
          subscribeToActiveDeviceVersions(client);
        },
        onFailure: (err) => {
          console.error('DevicePage: MQTT connection failed:', err);
        },
        useSSL: true,
        userName: mqttUser,
        password: mqttPassword,
        reconnect: true,
        keepAliveInterval: 30,
      });

      setMqttClient(client);
    };

    if (!devicesLoading && devices.length > 0) {
      initializeMqtt();
    }

    return () => {
      if (mqttClient && mqttClient.isConnected()) {
        mqttClient.disconnect();
      }
    };
  }, [devicesLoading, devices.length, handleMqttMessage]);

  // Re-subscribe when devices change
  useEffect(() => {
    if (mqttClient && mqttClient.isConnected()) {
      subscribeToActiveDeviceVersions(mqttClient);
    }
  }, [mqttClient, subscribeToActiveDeviceVersions]);

  // Enhanced fetch with Android compatibility
  const deviceFetch = async (url, options = {}) => {
    try {
      // Try regular fetch first
      const response = await fetch(url, {
        ...options,
        timeout: 10000,
        headers: {
          ...options.headers,
          Connection: 'close',
        },
      });
      return response;
    } catch (error) {
      console.log('Standard fetch failed, trying XMLHttpRequest');
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 10000;
        xhr.open(options.method || 'GET', url);

        xhr.onload = () => {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            text: () => Promise.resolve(xhr.responseText),
          });
        };

        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.ontimeout = () => reject(new Error('Request timed out'));

        if (options.headers) {
          Object.entries(options.headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
        }

        xhr.send(options.body);
      });
    }
  };

  /**
   * Fetch device info and extract device ID from HTML response
   * @returns {Promise<string|null>} - Device ID or null if not found
   */
  const fetchDeviceId = async () => {
    try {
      const response = await deviceFetch('http://192.168.4.1/');
      const html = await response.text();
      
      // Extract device name from <h3> tag
      const deviceName = extractDeviceNameFromHtml(html);
      if (!deviceName) {
        console.log('DevicePage: Could not extract device name from HTML');
        return null;
      }
      
      // Extract device ID from name
      const deviceId = extractDeviceId(deviceName);
      console.log('DevicePage: Extracted device ID:', deviceId);
      
      return deviceId;
    } catch (error) {
      console.error('DevicePage: Error fetching device ID:', error);
      return null;
    }
  };

  const checkDeviceConnection = async () => {
    try {
      // Check if connected to WiFi
      const { isConnected } = await Network.getNetworkStateAsync();
      if (!isConnected) {
        Alert.alert('Verify if your Mobile Data is disbaled');
        Alert.alert('Not Connected', "Please connect to your BeeGreen's WiFi network first", [
          { text: 'Open WiFi Settings', onPress: () => Linking.openSettings() },
          { text: 'OK' },
        ]);
        return false;
      }

      // Verify we're on the right network (192.168.4.x)
      const ip = await Network.getIpAddressAsync();
      if (!ip.startsWith('192.168.4.')) {
        Alert.alert('Wrong Network', `Connect to BeeGreen's WiFi network (current IP: ${ip})`, [
          { text: 'Open WiFi Settings', onPress: () => Linking.openSettings() },
          { text: 'OK' },
        ]);
        return false;
      }

      // Test if device is responding
      try {
        const ping = await deviceFetch('http://192.168.4.1', { method: 'HEAD' });
        if (!ping.ok) throw new Error('Device not responding');
        return true;
      } catch (pingError) {
        throw new Error("Device not reachable. Please ensure it's powered on");
      }
    } catch (error) {
      Alert.alert('Connection Error', error.message);
      return false;
    }
  };

  const scanWifiNetworks = async () => {
    try {
      console.log('--------logging data 0 ----------');
      setIsScanning(true);
      console.log('--------logging data 1 ----------');
      if (!(await checkDeviceConnection())) return;

      // Extract device ID before proceeding
      const deviceId = await fetchDeviceId();
      if (deviceId) {
        // Check if device already exists
        const exists = await deviceExists(deviceId);
        if (exists) {
          Alert.alert(
            'Device Already Added',
            'This device has already been added to your account. You can manage it in the device list below.',
            [{ text: 'OK' }]
          );
          setIsScanning(false);
          return;
        }
        setCurrentDeviceId(deviceId);
      } else {
        console.warn('DevicePage: Could not extract device ID, proceeding anyway');
      }

      // First try the standard endpoint
      let response = await deviceFetch('http://192.168.4.1/wifiscan');
      let data = await response.text(); // Get raw response first
      console.log('--------logging data 3 ----------');
      // Try to parse as JSON, fallback to plain text
      try {
        data = JSON.parse(data);
        //Alert.alert("----Found device : ", data);
        console.log('--------logging data 2 ----------');
        //		console.log('Response data:', JSON.stringify(data, null, 2)); // Pretty print
        setDevice(JSON.stringify(data, null, 2));
        //console.log('Data type:', typeof data);
        //console.log('Is array?', Array.isArray(data));
        //console.log('--------Ending logging data----------');
      } catch (e) {
        console.log('Response not JSON, trying alternative endpoints');

        // Try common alternative endpoints
        const endpoints = [
          'http://192.168.4.1/scan',
          'http://192.168.4.1/wifiscan',
          'http://192.168.4.1/wifi-scan',
        ];

        for (const endpoint of endpoints) {
          try {
            response = await deviceFetch(endpoint);
            data = await response.json();
            break; // Exit loop if successful
          } catch (err) {
            console.log(`Failed on ${endpoint}`, err);
          }
        }
      }

      console.log('Final scan response:', data);

      // Handle different response formats
      if (typeof data === 'string') {
        // If response is plain text, try to extract networks
        const networks = data
          .split('\n')
          .filter(line => line.includes('SSID:'))
          .map(line => {
            const ssid = line.replace('SSID:', '').trim();
            return { ssid, rssi: -50 }; // Default signal strength
          });

        if (networks.length > 0) {
          setWifiNetworks(networks);
          setShowWifiModal(true);
          return;
        }
        throw new Error('No networks found in text response');
      } else if (Array.isArray(data)) {
        // Handle array response format
        setWifiNetworks(data);
        setShowWifiModal(true);
      } else if (data.networks) {
        // Handle object with networks property
        setWifiNetworks(data.networks);
        setShowWifiModal(true);
      } else {
        throw new Error('Unexpected response format');
      }
      // console.log('device selected', data);
    } catch (error) {
      console.error('WiFi Scan Error:', error);
      Alert.alert(
        'Scan Failed',
        error.message.includes('No networks')
          ? 'No WiFi networks found. Please ensure:\n\n1. Your device has WiFi capability\n2. There are networks in range\n3. The device firmware supports scanning'
          : error.message
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleWifiSelect = async wifi => {
    setSelectedWifi(wifi);
    setWifiSSID(wifi.ssid);
    
    // Always hide password when form opens (security best practice)
    setShowWifiPassword(false);
    
    // Check for saved credentials and pre-populate password
    const savedPassword = await getSavedWifiPassword(wifi.ssid);
    if (savedPassword) {
      setWifiPassword(savedPassword);
    } else {
      setWifiPassword(''); // Clear any previous password
    }
    
    setShowWifiForm(true);
  };

  // Rescan WiFi networks without closing modal
  const rescanWifiNetworks = async () => {
    try {
      setIsScanning(true);

      if (!(await checkDeviceConnection())) return;

      let response = await deviceFetch('http://192.168.4.1/wifiscan');
      let data = await response.text();

      try {
        data = JSON.parse(data);
        setDevice(JSON.stringify(data, null, 2));
      } catch (e) {
        const endpoints = [
          'http://192.168.4.1/scan',
          'http://192.168.4.1/wifiscan',
          'http://192.168.4.1/wifi-scan',
        ];

        for (const endpoint of endpoints) {
          try {
            response = await deviceFetch(endpoint);
            data = await response.json();
            break;
          } catch (err) {
            console.log(`Failed on ${endpoint}`, err);
          }
        }
      }

      if (typeof data === 'string') {
        const networks = data
          .split('\n')
          .filter(line => line.includes('SSID:'))
          .map(line => {
            const ssid = line.replace('SSID:', '').trim();
            return { ssid, rssi: -50 };
          });

        if (networks.length > 0) {
          setWifiNetworks(networks);
          return;
        }
        throw new Error('No networks found');
      } else if (Array.isArray(data)) {
        setWifiNetworks(data);
      } else if (data.networks) {
        setWifiNetworks(data.networks);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('WiFi Rescan Error:', error);
      Alert.alert('Rescan Failed', error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const saveWifiCredentials = async () => {
    try {
      setIsSaving(true);

      if (!(await checkDeviceConnection())) return;

      // Ensure we have the required config data
      if (!savedData2?.mqttServer || !savedData2?.mqttUser || !savedData2?.mqttPassword) {
        Alert.alert('Error', 'MQTT configuration not found. Please log in again.');
        return;
      }

      const formData = new URLSearchParams();
      formData.append('s', wifiSSID);
      formData.append('p', wifiPassword);
      formData.append('mqtt_server', savedData2.mqttServer);
      formData.append('mqtt_port', '8883');
      formData.append('username', savedData2.mqttUser);
      formData.append('password', savedData2.mqttPassword);

      const response = await deviceFetch('http://192.168.4.1/wifisave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const responseData = await response.text();
      console.log('WiFi save response:', responseData);

      // Save the device to storage if we have a device ID
      if (currentDeviceId) {
        const addResult = await addDevice({
          id: currentDeviceId,
          firmwareVersion: 'unknown', // Will be updated when device connects
        });
        
        if (addResult.success) {
          console.log('DevicePage: Device saved successfully:', addResult.device);
        } else {
          console.warn('DevicePage: Failed to save device:', addResult.error);
        }
      }

      // Update config with device added flag using auth context
      await updateConfig({
        deviceAdded: true,
        wifiSSID,
        wifiPassword,
      });

      // Save WiFi credentials for future auto-fill (secure storage)
      await saveWifiPassword(wifiSSID, wifiPassword);

      Alert.alert('Success', `Device configured successfully! WiFi credentials saved for ${wifiSSID}`);
      setShowWifiForm(false);
      setShowWifiModal(false);
      setShowAddDevice(true);
      setCurrentDeviceId(null);
      
      // Refresh device list
      await refreshDevices();
      
      console.log('device selected..........');
    } catch (error) {
      console.error('Error saving WiFi credentials:', error);
      Alert.alert('Error', `Failed to save WiFi credentials: ${error.message}`);
    } finally {
      setIsSaving(false);
      console.log('device selected finally..........');
      console.log(device);
    }
  };

  /**
   * Handle device active toggle
   */
  const handleToggleDevice = async (deviceId, currentActive) => {
    const newActive = !currentActive;
    const success = await setDeviceActive(deviceId, newActive);
    
    if (!success) {
      Alert.alert('Error', 'Failed to update device status');
    }
  };

  /**
   * Handle device deletion
   */
  const handleDeleteDevice = (deviceId, deviceName) => {
    Alert.alert(
      'Delete Device',
      `Are you sure you want to delete "${deviceName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteDevice(deviceId);
            if (!success) {
              Alert.alert('Error', 'Failed to delete device');
            }
          },
        },
      ]
    );
  };

  /**
   * Start editing a device name
   */
  const handleEditDeviceName = (deviceItem) => {
    setEditingDevice(deviceItem);
    setEditedDeviceName(deviceItem.name);
  };

  /**
   * Save the edited device name
   */
  const handleSaveDeviceName = async () => {
    if (!editingDevice || !editedDeviceName.trim()) {
      Alert.alert('Error', 'Device name cannot be empty');
      return;
    }

    const result = await updateDevice(editingDevice.id, { name: editedDeviceName.trim() });
    
    if (result.success) {
      setEditingDevice(null);
      setEditedDeviceName('');
    } else {
      Alert.alert('Error', result.error || 'Failed to update device name');
    }
  };

  /**
   * Cancel editing device name
   */
  const handleCancelEditDeviceName = () => {
    setEditingDevice(null);
    setEditedDeviceName('');
  };

  /**
   * Render a single device item in the list
   */
  const renderDeviceItem = (deviceItem) => (
    <View key={deviceItem.id} style={styles.deviceItem}>
      <View style={styles.deviceInfo}>
        <View style={styles.deviceNameRow}>
          <MaterialIcons 
            name='device-hub' 
            size={20} 
            color={deviceItem.active ? '#4CAF50' : '#9CA3AF'} 
          />
          <Text style={[
            styles.deviceName, 
            !deviceItem.active && styles.deviceNameInactive
          ]}>
            {deviceItem.name}
          </Text>
          <TouchableOpacity
            style={styles.editNameButton}
            onPress={() => handleEditDeviceName(deviceItem)}
          >
            <MaterialIcons name='edit' size={16} color='#5E72E4' />
          </TouchableOpacity>
        </View>
        <Text style={styles.deviceVersion}>
          Firmware: {deviceItem.firmwareVersion || 'unknown'}
        </Text>
      </View>
      
      <View style={styles.deviceActions}>
        <Switch
          value={deviceItem.active}
          onValueChange={() => handleToggleDevice(deviceItem.id, deviceItem.active)}
          trackColor={{ false: '#E5E7EB', true: '#86EFAC' }}
          thumbColor={deviceItem.active ? '#4CAF50' : '#9CA3AF'}
        />
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteDevice(deviceItem.id, deviceItem.name)}
        >
          <MaterialIcons name='delete-outline' size={22} color='#F44336' />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='interactive'
        >
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>BeeGreen</Text>

            {showAddDevice && (
              <TouchableOpacity
                style={[styles.signupButton, { backgroundColor: '#4CAF50', marginTop: 20 }]}
                onPress={scanWifiNetworks}
                activeOpacity={0.8}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator color='white' />
                ) : (
                  <Text style={styles.signupButtonText}>ADD DEVICE</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Device List Section */}
          <View style={styles.deviceListContainer}>
            <View style={styles.deviceListHeader}>
              <Text style={styles.deviceListTitle}>My Devices</Text>
              <TouchableOpacity onPress={refreshDevices} disabled={devicesLoading}>
                {devicesLoading ? (
                  <ActivityIndicator size='small' color='#4CAF50' />
                ) : (
                  <MaterialIcons name='refresh' size={24} color='#4CAF50' />
                )}
              </TouchableOpacity>
            </View>
            
            {devicesLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size='small' color='#4CAF50' />
                <Text style={styles.loadingText}>Loading devices...</Text>
              </View>
            ) : devices.length > 0 ? (
              <View style={styles.deviceList}>
                {devices.map(renderDeviceItem)}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <MaterialIcons name='devices' size={48} color='rgba(255,255,255,0.3)' />
                <Text style={styles.emptyText}>No devices added yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap "ADD DEVICE" to configure your first BeeGreen device
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* WiFi Networks Modal */}
      <Modal
        visible={showWifiModal}
        animationType='slide'
        transparent={true}
        onRequestClose={() => setShowWifiModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Available WiFi Networks</Text>
              <TouchableOpacity
                style={styles.rescanButton}
                onPress={rescanWifiNetworks}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size='small' color='#4CAF50' />
                ) : (
                  <MaterialIcons name='refresh' size={24} color='#4CAF50' />
                )}
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.wifiList}>
              {wifiNetworks.length > 0 ? (
                wifiNetworks.map((wifi, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.wifiItem}
                    onPress={() => handleWifiSelect(wifi)}
                  >
                    <Text style={styles.wifiText}>
                      {wifi.ssid} (Signal: {wifi.rssi} dBm)
                    </Text>
                    <MaterialIcons
                      name='wifi'
                      size={20}
                      color={wifi.rssi > -50 ? '#4CAF50' : wifi.rssi > -70 ? '#FFC107' : '#F44336'}
                    />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noNetworksText}>No networks found</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowWifiModal(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* WiFi Credentials Form Modal */}
      <Modal
        visible={showWifiForm}
        animationType='slide'
        transparent={true}
        onRequestClose={() => setShowWifiForm(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter WiFi Credentials</Text>
            <Text style={styles.selectedWifiText}>
              Network: {selectedWifi?.ssid} (Signal: {selectedWifi?.rssi} dBm)
            </Text>

            <TextInput
              style={styles.input}
              placeholder='WiFi SSID'
              placeholderTextColor='#aaa'
              value={wifiSSID}
              onChangeText={setWifiSSID}
              editable={false}
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder='WiFi Password'
                placeholderTextColor='#aaa'
                value={wifiPassword}
                onChangeText={setWifiPassword}
                secureTextEntry={!showWifiPassword}
                autoCapitalize='none'
                color='#333'
                returnKeyType='done'
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowWifiPassword(!showWifiPassword)}
              >
                <Text style={styles.eyeButtonText}>{showWifiPassword ? 'HIDE' : 'SHOW'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.signupButton, { marginTop: 20 }]}
              onPress={saveWifiCredentials}
              activeOpacity={0.8}
              disabled={isSaving || !wifiPassword}
            >
              {isSaving ? (
                <ActivityIndicator color='white' />
              ) : (
                <Text style={styles.signupButtonText}>Save WiFi Credentials</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeButton, { marginTop: 10 }]}
              onPress={() => setShowWifiForm(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Device Name Modal */}
      <Modal
        visible={editingDevice !== null}
        animationType='fade'
        transparent={true}
        onRequestClose={handleCancelEditDeviceName}
      >
        <View style={styles.modalContainer}>
          <View style={styles.editNameModalContent}>
            <Text style={styles.modalTitle}>Edit Device Name</Text>
            
            <TextInput
              style={styles.editNameInput}
              placeholder='Enter device name'
              placeholderTextColor='#aaa'
              value={editedDeviceName}
              onChangeText={setEditedDeviceName}
              autoFocus={true}
              maxLength={50}
            />

            <View style={styles.editNameButtonRow}>
              <TouchableOpacity
                style={styles.editNameCancelButton}
                onPress={handleCancelEditDeviceName}
              >
                <Text style={styles.editNameCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editNameSaveButton,
                  !editedDeviceName.trim() && styles.editNameSaveButtonDisabled
                ]}
                onPress={handleSaveDeviceName}
                disabled={!editedDeviceName.trim()}
              >
                <Text style={styles.editNameSaveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f44336',
    borderRadius: 5,
    padding: 10,
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#2E8B57',
    flex: 1,
  },
  deleteButton: {
    marginLeft: 10,
    padding: 4,
  },
  deviceActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 15,
  },
  deviceList: {
    marginTop: 10,
  },
  deviceListContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  deviceListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  deviceListTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deviceName: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  deviceNameInactive: {
    color: '#9CA3AF',
  },
  deviceNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  deviceVersion: {
    color: '#666',
    fontSize: 12,
    marginLeft: 28,
    marginTop: 4,
  },
  editNameButton: {
    marginLeft: 8,
    padding: 4,
  },
  editNameModalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  editNameInput: {
    backgroundColor: '#F7FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#333',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 20,
    padding: 12,
  },
  editNameButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editNameCancelButton: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginRight: 8,
    padding: 12,
  },
  editNameCancelButtonText: {
    color: '#4A5568',
    fontSize: 14,
    fontWeight: '600',
  },
  editNameSaveButton: {
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    padding: 12,
  },
  editNameSaveButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  editNameSaveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 10,
  },
  eyeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    padding: 8,
    position: 'absolute',
    right: 10,
  },
  eyeButtonText: {
    color: 'green',
    fontSize: 12,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    borderWidth: 1,
    color: 'white',
    fontSize: 16,
    height: 50,
    marginBottom: 15,
    paddingHorizontal: 15,
    width: '100%',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 10,
  },
  modalContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 45, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    maxHeight: '80%',
    padding: 20,
    width: '80%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  modalTitle: {
    color: '#333',
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rescanButton: {
    alignItems: 'center',
    borderColor: '#4CAF50',
    borderRadius: 20,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  noNetworksText: {
    color: '#777',
    padding: 10,
    textAlign: 'center',
  },
  passwordContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 15,
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 70,
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingVertical: 20,
  },
  scrollView: {
    flex: 1,
  },
  selectedWifiText: {
    color: '#555',
    marginBottom: 15,
    textAlign: 'center',
  },
  signupButton: {
    alignItems: 'center',
    backgroundColor: '#1E6F9F',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 10,
    padding: 15,
    width: '100%',
  },
  signupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  signupContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    elevation: 5,
    marginVertical: 20,
    maxWidth: 400,
    padding: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '90%',
  },
  signupText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 25,
  },
  wifiItem: {
    alignItems: 'center',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
  },
  wifiList: {
    marginBottom: 15,
    maxHeight: 300,
  },
  wifiText: {
    color: '#333',
    fontSize: 16,
  },
});

export default DevicePage;
