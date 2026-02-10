import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Paho from 'paho-mqtt';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import DeviceSelector from './DeviceSelector';
import { useDevices } from '../services/devices';
import { 
  subscribeToDevice, 
  unsubscribeFromDevice, 
  parseDeviceIdFromTopic, 
  parseDeviceStatus as parseStatusPayload,
  CONTROLLER_TOPICS,
  buildTopic,
} from '../services/mqtt';
import { parseStringPayload } from './tools';

// Configure notifications handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ControlPage = ({ navigation }) => {
  // Device storage hook
  const { 
    devices: storedDevices, 
    loading: devicesLoading,
    refreshDevices,
  } = useDevices();

  const [isRunning, setIsRunning] = useState(false);
  const [pumpStatus, setPumpStatus] = useState('off');
  const [duration, setDuration] = useState(5);
  const [client, setClient] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [currentDevice, setCurrentDevice] = useState(null); // Now stores device object
  const [deviceStatus, setDeviceStatus] = useState({}); // Per-device online/offline status
  const [mqttConnected, setMqttConnected] = useState(false);

  const timerRef = useRef(null);
  const lastPumpStatusRef = useRef('off');
  const notificationListener = useRef();
  const responseListener = useRef();
  const deviceStatusRef = useRef({});
  const subscribedDevicesRef = useRef(new Set());

  // Refresh devices when page is focused (to get updated names, etc.)
  useFocusEffect(
    useCallback(() => {
      refreshDevices();
    }, [refreshDevices])
  );

  // Check if current device is available for actions
  const isDeviceAvailable = useCallback(() => {
    if (!currentDevice) return false;
    if (!currentDevice.active) return false;
    const status = deviceStatus[currentDevice.id];
    return status === 'online';
  }, [currentDevice, deviceStatus]);

  // Update device status
  const updateDeviceStatus = useCallback((deviceId, isOnline) => {
    const statusStr = isOnline ? 'online' : 'offline';
    deviceStatusRef.current = { ...deviceStatusRef.current, [deviceId]: statusStr };
    setDeviceStatus(prev => ({ ...prev, [deviceId]: statusStr }));
    console.log(`ControlPage: Device ${deviceId} status: ${statusStr}`);
  }, []);

  // Register for push notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      console.log('Push notifications ready');
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification interaction:', response);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // Register for push notifications
  async function registerForPushNotificationsAsync() {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        setNotificationPermission(false);
        return;
      }

      setNotificationPermission(true);
      console.log('Push notification permission granted');
    } catch (error) {
      console.error('Error setting up push notifications:', error);
      setNotificationPermission(false);
    }
  }

  // Send push notification
  const sendPushNotification = async (title, body) => {
    try {
      if (!notificationPermission) {
        console.log('Notification permission not granted');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: title,
          body: body,
          sound: true,
          vibrate: [0, 250, 250, 250],
          priority: 'high',
          autoDismiss: true,
        },
        trigger: null,
      });
      console.log(`Push notification sent: ${title} - ${body}`);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  };

  const handlePumpStatusChange = (newStatus, deviceName) => {
    const oldStatus = lastPumpStatusRef.current;

    if (newStatus !== oldStatus) {
      lastPumpStatusRef.current = newStatus;

      if (newStatus === 'on') {
        sendPushNotification(
          '🚰 Pump Started',
          `Water pump on ${deviceName || 'device'} is now running for ${duration} seconds`
        );
      } else if (newStatus === 'off' && oldStatus === 'on') {
        sendPushNotification(
          '✅ Pump Stopped',
          `Water pump on ${deviceName || 'device'} has been turned off`
        );
      }
    }
  };

  // Subscribe to topics for active devices
  const subscribeToActiveDevices = useCallback((mqttClient) => {
    if (!mqttClient || !mqttClient.isConnected()) return;

    const activeDevices = storedDevices.filter(d => d.active);
    
    activeDevices.forEach(device => {
      if (!subscribedDevicesRef.current.has(device.id)) {
        subscribeToDevice(mqttClient, device.id, CONTROLLER_TOPICS);
        subscribedDevicesRef.current.add(device.id);
        // Initialize status as offline until we receive status message
        updateDeviceStatus(device.id, false);
      }
    });
  }, [storedDevices, updateDeviceStatus]);

  // Handle MQTT message
  const handleMqttMessage = useCallback((message) => {
    const topic = message.destinationName;
    const deviceId = parseDeviceIdFromTopic(topic);

    // Handle device status messages
    if (topic.endsWith('/status')) {
      if (deviceId) {
        const isOnline = parseStatusPayload(message);
        updateDeviceStatus(deviceId, isOnline);
      }
    }
    // Handle pump status messages
    else if (topic.endsWith('/pump_status')) {
      const status = parseStringPayload(message.payloadString).toLowerCase();
      
      if (status && deviceId && currentDevice && deviceId === currentDevice.id) {
        handlePumpStatusChange(status, currentDevice.name);
        setPumpStatus(status);
        setIsRunning(status === 'on');

        if (status === 'off' && timerRef.current) {
          clearTimeout(timerRef.current);
        }
      }
    }
  }, [currentDevice, updateDeviceStatus]);

  // Initialize MQTT connection
  useEffect(() => {
    const initializeMqtt = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (config) {
        const parsedConfig = JSON.parse(config);

        if (parsedConfig.mqttServer) {
          const mqttClient = new Paho.Client(
            parsedConfig.mqttServer,
            Number(parsedConfig.mqttPort),
            'clientId-' + Math.random().toString(16).substr(2, 8)
          );

          mqttClient.onMessageArrived = handleMqttMessage;

          mqttClient.onConnectionLost = responseObject => {
            if (responseObject.errorCode !== 0) {
              console.log('Connection lost:', responseObject.errorMessage);
              setMqttConnected(false);
              // Mark all devices as offline
              Object.keys(deviceStatusRef.current).forEach(deviceId => {
                updateDeviceStatus(deviceId, false);
              });
              sendPushNotification('🔌 Connection Lost', 'Lost connection to MQTT broker');
            }
          };

          mqttClient.connect({
            onSuccess: () => {
              setMqttConnected(true);
              console.log('ControlPage: MQTT connected');
              
              // Subscribe to active devices
              subscribeToActiveDevices(mqttClient);
              
              // Set first active device as current
              if (storedDevices.length > 0) {
                const activeDevices = storedDevices.filter(d => d.active);
                if (activeDevices.length > 0) {
                  setCurrentDevice(activeDevices[0]);
                }
              }

              sendPushNotification('🔗 Connected', 'Successfully connected to MQTT broker');
            },
            onFailure: err => {
              console.error('Connection failed', err);
              setMqttConnected(false);
              sendPushNotification('❌ Connection Failed', 'Unable to connect to MQTT broker');
            },
            useSSL: true,
            userName: parsedConfig.mqttUser,
            password: parsedConfig.mqttPassword,
          });

          setClient(mqttClient);
        }
      }
    };

    // Wait for devices to load before initializing MQTT
    if (!devicesLoading && storedDevices.length > 0) {
      initializeMqtt();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [devicesLoading, storedDevices.length]);

  // Re-subscribe when devices change
  useEffect(() => {
    if (client && mqttConnected) {
      subscribeToActiveDevices(client);
    }
  }, [client, mqttConnected, subscribeToActiveDevices]);

  const handlePumpControl = start => {
    if (!client || !client.isConnected() || !isDeviceAvailable()) {
      sendPushNotification('❌ Command Failed', 'Device not available');
      return;
    }

    const targetTopic = buildTopic(currentDevice.id, 'pump_trigger');

    const message = new Paho.Message(start ? duration.toString() : '0');
    message.destinationName = targetTopic;
    message.qos = 1;
    client.send(message);

    const deviceInfo = ` for device "${currentDevice.name}"`;
    if (start) {
      sendPushNotification(
        '⏱️ Pump Starting',
        `Sending start command${deviceInfo} for ${duration} seconds...`
      );

      timerRef.current = setTimeout(() => {
        setIsRunning(false);
        setPumpStatus('off');
        handlePumpStatusChange('off', currentDevice.name);
      }, duration * 1000);
    } else {
      sendPushNotification('🛑 Stopping Pump', `Sending stop command${deviceInfo}...`);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }
  };

  const testNotification = async () => {
    await sendPushNotification(
      '🔔 Test Notification',
      'This is a test push notification from BeeGreen Controller'
    );
  };

  const switchDevice = (device) => {
    // DeviceSelector only calls this for selectable devices
    setCurrentDevice(device);
    // Reset pump status when switching devices
    setPumpStatus('off');
    setIsRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    sendPushNotification('🔄 Device Switched', `Now controlling device: ${device.name}`);
  };

  const deviceAvailable = isDeviceAvailable();
  const hasAnyOnlineDevice = storedDevices.some(d => d.active && deviceStatus[d.id] === 'online');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#f8f9fa' />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BeeGreen Controller</Text>
          <View
            style={[styles.statusIndicator, { backgroundColor: mqttConnected ? '#4CAF50' : '#F44336' }]}
          >
            <Text style={styles.statusText}>{mqttConnected ? 'CONNECTED' : 'DISCONNECTED'}</Text>
          </View>
        </View>

        {/* Device Selection */}
        <DeviceSelector
          devices={storedDevices}
          currentDevice={currentDevice}
          deviceStatus={deviceStatus}
          onSelectDevice={switchDevice}
        />

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name='opacity' size={24} color='#5E72E4' />
            <Text style={styles.cardTitle}>
              Pump Controller {currentDevice ? `(${currentDevice.name})` : ''}
            </Text>
            <TouchableOpacity style={styles.testNotificationButton} onPress={testNotification}>
              <MaterialIcons name='notifications' size={20} color='#5E72E4' />
            </TouchableOpacity>
          </View>

          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>Current Status:</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: pumpStatus === 'on' ? '#4CAF50' : '#F44336' },
              ]}
            >
              <Text style={styles.statusBadgeText}>{pumpStatus.toUpperCase()}</Text>
            </View>
          </View>

          {!isRunning ? (
            <>
              <Text style={styles.durationLabel}>Duration: {duration} seconds</Text>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={60}
                step={1}
                value={duration}
                onValueChange={setDuration}
                minimumTrackTintColor='#5E72E4'
                maximumTrackTintColor='#E2E8F0'
                thumbTintColor='#5E72E4'
                disabled={!deviceAvailable}
              />
              <TouchableOpacity
                style={[
                  styles.controlButton, 
                  { backgroundColor: deviceAvailable ? '#4CAF50' : '#CBD5E0' }
                ]}
                onPress={() => handlePumpControl(true)}
                disabled={!deviceAvailable}
              >
                <Text style={styles.controlButtonText}>
                  {devicesLoading 
                    ? 'LOADING...'
                    : storedDevices.length === 0 
                      ? 'NO DEVICES ADDED' 
                      : !currentDevice 
                        ? 'SELECT A DEVICE' 
                        : !deviceAvailable 
                          ? 'DEVICE UNAVAILABLE'
                          : 'START PUMP'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: deviceAvailable ? '#F44336' : '#CBD5E0' }]}
              onPress={() => handlePumpControl(false)}
              disabled={!deviceAvailable}
            >
              <Text style={styles.controlButtonText}>STOP PUMP</Text>
            </TouchableOpacity>
          )}

          {storedDevices.length === 0 && !devicesLoading && (
            <View style={styles.infoBox}>
              <MaterialIcons name='info' size={20} color='#5E72E4' />
              <Text style={styles.infoText}>
                No devices added yet. Go to the Device page to add your BeeGreen device.
              </Text>
            </View>
          )}

          {storedDevices.length > 0 && !hasAnyOnlineDevice && !devicesLoading && (
            <View style={styles.infoBox}>
              <MaterialIcons name='cloud-off' size={20} color='#F44336' />
              <Text style={styles.infoText}>
                All devices are offline. Please check device connectivity.
              </Text>
            </View>
          )}

          {!notificationPermission && (
            <View style={styles.notificationWarning}>
              <MaterialIcons name='warning' size={16} color='#FF9800' />
              <Text style={styles.notificationWarningText}>
                Push notifications not enabled. Please allow notifications in settings.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>BeeGreen Irrigation System</Text>
          <Text style={styles.footerSubText}>Multi-Device Support Enabled</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    elevation: 3,
    marginBottom: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 20,
  },
  cardTitle: {
    color: '#2D3748',
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  container: {
    backgroundColor: '#f8f9fa',
    flex: 1,
    paddingHorizontal: 20,
  },
  controlButton: {
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 15,
  },
  controlButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  durationLabel: {
    color: '#4A5568',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  footerSubText: {
    color: '#CBD5E0',
    fontSize: 10,
    marginTop: 5,
  },
  footerText: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    marginTop: 20,
  },
  headerTitle: {
    color: '#2D3748',
    fontSize: 24,
    fontWeight: '700',
  },
  infoBox: {
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 15,
    padding: 15,
  },
  infoText: {
    color: '#0369A1',
    flex: 1,
    fontSize: 12,
    marginLeft: 10,
  },
  notificationWarning: {
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 15,
    padding: 12,
  },
  notificationWarningText: {
    color: '#E65100',
    flex: 1,
    fontSize: 12,
    marginLeft: 8,
  },
  slider: {
    height: 40,
    marginBottom: 25,
    width: '100%',
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 25,
  },
  statusIndicator: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusLabel: {
    color: '#718096',
    fontSize: 16,
    marginRight: 10,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  testNotificationButton: {
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    padding: 8,
  },
});

export default ControlPage;
