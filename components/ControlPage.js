import React, { useState, useEffect, useRef } from 'react';
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
import Paho from 'paho-mqtt';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

// Configure notifications handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ControlPage = ({ navigation }) => {
  const [deviceAdded, setDeviceAdded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [pumpStatus, setPumpStatus] = useState('off');
  const [duration, setDuration] = useState(5);
  const [isOnline, setIsOnline] = useState(false);
  const [client, setClient] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [devices, setDevices] = useState([]); // Store all discovered devices
  const [currentDevice, setCurrentDevice] = useState(''); // Currently selected device
  const [availableDevices, setAvailableDevices] = useState([]); // List of available devices for UI

  const pumpTriggerTopic = '${currentDevice}/pump_trigger';
  const pumpStatusTopic = '${currentDevice}/pump_status';
  const heartbeatTopicPattern = '+/heartbeat'; // MQTT wildcard pattern for device heartbeat
  const devicePumpStatusPattern = '+/pump_status'; // MQTT wildcard pattern for device pump status

  const timerRef = useRef(null);
  const lastMessageTimeRef = useRef(null);
  const connectionCheckIntervalRef = useRef(null);
  const lastPumpStatusRef = useRef('off');
  const notificationListener = useRef();
  const responseListener = useRef();
  const devicesRef = useRef(new Set()); // Using ref to track devices without triggering re-renders
  const deviceHeartbeatTimes = useRef({}); // Track last heartbeat time for each device

  // Register for push notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      console.log('Push notifications ready');
    });

    // This listener is fired whenever a notification is received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // This listener is fired whenever a user taps on or interacts with a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification interaction:', response);
    });

    return () => {
      // Use .remove() method on subscription objects (newer expo-notifications API)
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
        trigger: null, // Send immediately
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

  // Extract device name from topic
  const extractDeviceName = topic => {
    // Topic format: [DEVICENAME]/heartbeat or [DEVICENAME]/pump_status
    const parts = topic.split('/');
    return parts.length > 0 ? parts[0] : null;
  };

  // Add a new device to the list
  const addNewDevice = deviceName => {
    if (!devicesRef.current.has(deviceName)) {
      devicesRef.current.add(deviceName);

      // Update state for UI
      setDevices(prev => {
        const updated = [...prev, deviceName];
        setAvailableDevices(updated);
        return updated;
      });

      // If this is the first device, set it as current
      if (devicesRef.current.size === 1) {
        setCurrentDevice(deviceName);
      }

      console.log(`New device discovered: ${deviceName}`);

      // Send notification for new device
      sendPushNotification('🔍 New Device Found', `BeeGreen device "${deviceName}" is now online`);
    }

    // Update heartbeat time
    deviceHeartbeatTimes.current[deviceName] = Date.now();
  };

  // Check for offline devices
  const checkDeviceHeartbeats = () => {
    const now = Date.now();
    const offlineThreshold = 1200000; // 20 minutes

    Object.keys(deviceHeartbeatTimes.current).forEach(deviceName => {
      const lastHeartbeat = deviceHeartbeatTimes.current[deviceName];
      if (now - lastHeartbeat > offlineThreshold) {
        console.log(`Device ${deviceName} is offline`);
        // You could add logic here to mark device as offline in UI
      }
    });
  };

  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        setDeviceAdded(parsedConfig.deviceAdded || false);

        if (parsedConfig.mqttServer) {
          const mqttClient = new Paho.Client(
            parsedConfig.mqttServer,
            Number(parsedConfig.mqttPort),
            'clientId-' + Math.random().toString(16).substr(2, 8)
          );

          mqttClient.onMessageArrived = message => {
            const topic = message.destinationName;
            const deviceName = extractDeviceName(topic);

            // Handle heartbeat messages
            if (topic.endsWith('/heartbeat')) {
              if (deviceName) {
                addNewDevice(deviceName);
                setIsOnline(true);
                lastMessageTimeRef.current = Date.now();

                // Notify on reconnection for this specific device
                if (!isOnline) {
                  sendPushNotification(
                    '🔗 Reconnected',
                    `Connection to BeeGreen device "${deviceName}" restored`
                  );
                }
              }
            }
            // Handle pump status messages
            else if (topic.endsWith('/pump_status')) {
              try {
                const payload = JSON.parse(message.payloadString);
                const status = payload.payload.toLowerCase();

                // Handle pump status change for this device
                handlePumpStatusChange(status, deviceName);

                setPumpStatus(status);
                setIsRunning(status === 'on');
                setDeviceAdded(true);
                setIsOnline(true);
                lastMessageTimeRef.current = Date.now();

                if (status === 'off' && timerRef.current) {
                  clearTimeout(timerRef.current);
                }
              } catch (error) {
                console.error('Error parsing message:', error);
              }
            }
            // Backward compatibility with old topics
            else if (topic === pumpStatusTopic) {
              try {
                const payload = JSON.parse(message.payloadString);
                const status = payload.payload.toLowerCase();

                // Handle pump status change
                handlePumpStatusChange(status);

                setPumpStatus(status);
                setIsRunning(status === 'on');
                setDeviceAdded(true);
                setIsOnline(true);
                lastMessageTimeRef.current = Date.now();

                if (status === 'off' && timerRef.current) {
                  clearTimeout(timerRef.current);
                }
              } catch (error) {
                console.error('Error parsing message:', error);
              }
            }
          };

          mqttClient.connect({
            onSuccess: () => {
              // Subscribe to wildcard topics for multi-device support
              mqttClient.subscribe(heartbeatTopicPattern);
              mqttClient.subscribe(devicePumpStatusPattern);

              // Also subscribe to old topics for backward compatibility
              mqttClient.subscribe(pumpStatusTopic);

              setIsOnline(true);

              // Send connection notification
              sendPushNotification('🔗 Connected', 'Successfully connected to MQTT broker');

              // Start checking for message freshness
              connectionCheckIntervalRef.current = setInterval(() => {
                if (
                  lastMessageTimeRef.current &&
                  Date.now() - lastMessageTimeRef.current > 1200000
                ) {
                  setIsOnline(false);
                  sendPushNotification(
                    '⚠️ Connection Issue',
                    'No messages received for 20 minutes'
                  );
                }

                // Check device heartbeats
                checkDeviceHeartbeats();
              }, 5000);
            },
            onFailure: err => {
              console.error('Connection failed', err);
              setIsOnline(false);
              sendPushNotification('❌ Connection Failed', 'Unable to connect to MQTT broker');
            },
            useSSL: true,
            userName: parsedConfig.mqttUser,
            password: parsedConfig.mqttPassword,
          });

          mqttClient.onConnectionLost = responseObject => {
            if (responseObject.errorCode !== 0) {
              console.log('Connection lost:', responseObject.errorMessage);
              setIsOnline(false);
              sendPushNotification('🔌 Connection Lost', 'Lost connection to MQTT broker');
            }
          };

          setClient(mqttClient);
        }
      }
    };

    fetchSavedData();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
    };
  }, [duration]);

  const handlePumpControl = start => {
    if (client && client.isConnected()) {
      setIsOnline(true);

      // Determine which topic to use based on current device
      let targetTopic;
      if (currentDevice) {
        targetTopic = `${currentDevice}/pump_trigger`;
      } else {
        targetTopic = pumpTriggerTopic; // Fallback to old topic
      }

      const message = new Paho.Message(start ? duration.toString() : '0');
      message.destinationName = targetTopic;
      message.qos = 1;
      client.send(message);
      lastMessageTimeRef.current = Date.now();

      // Send immediate feedback for user action
      const deviceInfo = currentDevice ? ` for device "${currentDevice}"` : '';
      if (start) {
        sendPushNotification(
          '⏱️ Pump Starting',
          `Sending start command${deviceInfo} for ${duration} seconds...`
        );

        // Set timeout as fallback
        timerRef.current = setTimeout(() => {
          setIsRunning(false);
          setPumpStatus('off');
          handlePumpStatusChange('off');
        }, duration * 1000);
      } else {
        sendPushNotification('🛑 Stopping Pump', `Sending stop command${deviceInfo}...`);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      }
    } else {
      sendPushNotification('❌ Command Failed', 'Unable to send command - device offline');
    }
  };

  const testNotification = async () => {
    await sendPushNotification(
      '🔔 Test Notification',
      'This is a test push notification from BeeGreen Controller'
    );
  };

  const switchDevice = deviceName => {
    setCurrentDevice(deviceName);
    // Reset pump status when switching devices
    setPumpStatus('off');
    setIsRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    sendPushNotification('🔄 Device Switched', `Now controlling device: ${deviceName}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#f8f9fa' />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BeeGreen Controller</Text>
          <View
            style={[styles.statusIndicator, { backgroundColor: isOnline ? '#4CAF50' : '#F44336' }]}
          >
            <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>

        {/* Device Selection Card */}
        {availableDevices.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name='devices' size={24} color='#5E72E4' />
              <Text style={styles.cardTitle}>Available Devices</Text>
              <Text style={styles.deviceCount}>{availableDevices.length} device(s)</Text>
            </View>

            <Text style={styles.deviceLabel}>Current Device:</Text>
            <Text style={styles.currentDevice}>{currentDevice || 'None selected'}</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceList}>
              {availableDevices.map((device, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.deviceButton,
                    currentDevice === device && styles.deviceButtonActive,
                  ]}
                  onPress={() => switchDevice(device)}
                >
                  <MaterialIcons
                    name='device-hub'
                    size={20}
                    color={currentDevice === device ? 'white' : '#5E72E4'}
                  />
                  <Text
                    style={[
                      styles.deviceButtonText,
                      currentDevice === device && styles.deviceButtonTextActive,
                    ]}
                  >
                    {device}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name='opacity' size={24} color='#5E72E4' />
            <Text style={styles.cardTitle}>
              Pump Controller {currentDevice ? `(${currentDevice})` : ''}
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
              />
              <TouchableOpacity
                style={[styles.controlButton, { backgroundColor: '#4CAF50' }]}
                onPress={() => handlePumpControl(true)}
                disabled={!currentDevice && availableDevices.length > 0}
              >
                <Text style={styles.controlButtonText}>
                  {!currentDevice && availableDevices.length > 0
                    ? 'SELECT A DEVICE FIRST'
                    : 'START PUMP'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: '#F44336' }]}
              onPress={() => handlePumpControl(false)}
            >
              <Text style={styles.controlButtonText}>STOP PUMP</Text>
            </TouchableOpacity>
          )}

          {availableDevices.length === 0 && (
            <View style={styles.infoBox}>
              <MaterialIcons name='info' size={20} color='#5E72E4' />
              <Text style={styles.infoText}>
                Waiting for devices to connect... Devices will appear automatically when they send
                heartbeat messages.
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
  currentDevice: {
    color: '#5E72E4',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 15,
  },
  deviceButton: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginRight: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  deviceButtonActive: {
    backgroundColor: '#5E72E4',
    borderColor: '#5E72E4',
  },
  deviceButtonText: {
    color: '#5E72E4',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  deviceButtonTextActive: {
    color: 'white',
  },
  deviceCount: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '600',
  },
  deviceLabel: {
    color: '#718096',
    fontSize: 14,
    marginBottom: 5,
  },
  deviceList: {
    marginBottom: 5,
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
