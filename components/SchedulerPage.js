import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Paho from 'paho-mqtt';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { parseArrayPayload, parseStringPayload } from './tools';

const SchedulerPage = ({ navigation }) => {
  // State management
  const [schedules, setSchedules] = useState({});
  const [isOnline, setIsOnline] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState({
    index: 0,
    hour: 8,
    min: 0,
    dur: 60,
    dow: 62,
    en: 1,
  });
  const [currentDevice, setCurrentDevice] = useState('');
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [nextRunTimes, setNextRunTimes] = useState({});
  const [refreshingNextRun, setRefreshingNextRun] = useState(true); // New state for refresh animation

  // MQTT Topics
  const topics = {
    setSchedule: '${currentDevice}/set_schedule',
    requestSchedules: '${currentDevice}/get_schedules',
    getSchedulesResponse: '${currentDevice}/get_schedules_response',
    heartbeat: '${currentDevice}/heartbeat',
    deviceSetSchedulePattern: '+/set_schedule',
    deviceRequestSchedulesPattern: '+/get_schedules',
    deviceGetSchedulesResponsePattern: '+/get_schedules_response',
    deviceHeartbeatPattern: '+/heartbeat',
    deviceNextSchedulePattern: '+/next_schedule_due',
    deviceRequestNextSchedule: '+/get_next_schedule_due', // New topic to request next schedule
  };

  // Refs
  const devicesRef = useRef(new Set());
  const schedulesRef = useRef({});
  const nextRunTimesRef = useRef({});
  const refreshingNextRunRef = useRef(false);

  // Days of week values for bitmask
  const daysValues = {
    Sunday: 1,
    Monday: 2,
    Tuesday: 4,
    Wednesday: 8,
    Thursday: 16,
    Friday: 32,
    Saturday: 64,
  };

  // Extract device name from topic
  const extractDeviceName = topic => {
    const parts = topic.split('/');
    return parts.length > 0 ? parts[0] : null;
  };

  const formatNextRunTime = dateTimeStr => {
    if (!dateTimeStr || dateTimeStr === 'N/A') {
      return 'N/A';
    }

    // Handle empty payload case
    if (dateTimeStr === '' || dateTimeStr === '0') {
      return 'No next run scheduled';
    }

    try {
      // Parse datetime string format "YYYY-MM-DD HH:mm:ss"
      const date = new Date(dateTimeStr.replace(' ', 'T'));
      if (isNaN(date.getTime())) {
        return 'No next run scheduled';
      }

      const now = new Date();
      const today = now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Today → "Today, 08:00 AM"
      if (date.toDateString() === today) {
        return `Today, ${timeStr}`;
      }
      // Tomorrow → "Tomorrow, 08:00 AM"
      else if (date.toDateString() === tomorrow.toDateString()) {
        return `Tomorrow, ${timeStr}`;
      }
      // After tomorrow → "Wed, Jan 28, 08:00 AM"
      else {
        return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeStr}`;
      }
    } catch (error) {
      return 'No next run scheduled';
    }
  };

  // Add a new device to the list
  const addNewDevice = deviceName => {
    if (!devicesRef.current.has(deviceName)) {
      devicesRef.current.add(deviceName);

      const newDevices = Array.from(devicesRef.current);
      setDevices(newDevices);

      // Initialize next run time for new device
      const times = { ...nextRunTimesRef.current };
      times[deviceName] = 'N/A';
      nextRunTimesRef.current = times;
      setNextRunTimes(times);

      // If this is the first device, set it as current
      if (devicesRef.current.size === 1) {
        setCurrentDevice(deviceName);
        loadSchedulesForDevice(deviceName);
      }

      console.log(`New device discovered: ${deviceName}`);
    }
  };

  // Update next run time for a device
  const updateNextRunTime = (deviceName, timestamp) => {
    const times = { ...nextRunTimesRef.current };
    times[deviceName] = timestamp;
    nextRunTimesRef.current = times;
    setNextRunTimes(times);

    console.log(`Updated next run time for ${deviceName}: ${timestamp}`);
  };

  // Request next run time from device
  const requestNextRunTime = () => {
    if (!client || !client.isConnected() || !currentDevice) {
      Alert.alert('Offline', 'Not connected to device');
      return;
    }

    setRefreshingNextRun(true);
    refreshingNextRunRef.current = true;

    try {
      const message = new Paho.Message('');
      message.destinationName = `${currentDevice}/get_next_schedule_due`;
      message.qos = 1;
      client.send(message);

      // Timeout - silently stop refreshing (device may have auto-published already)
      setTimeout(() => {
        if (refreshingNextRunRef.current) {
          refreshingNextRunRef.current = false;
          setRefreshingNextRun(false);
        }
      }, 3000);
    } catch (error) {
      refreshingNextRunRef.current = false;
      setRefreshingNextRun(false);
    }
  };

  // Parse schedules from payload array
  const parseSchedulesFromPayload = payloadArray => {
    const schedules = [];

    if (!Array.isArray(payloadArray) || payloadArray.length === 0) {
      return schedules;
    }

    payloadArray.forEach((item, index) => {
      if (typeof item === 'string') {
        const parts = item.split(':').map(part => part.trim());

        if (parts.length === 5) {
          schedules.push({
            index: parseInt(parts[0]) || index,
            hour: parseInt(parts[1]) || 0,
            min: parseInt(parts[2]) || 0,
            dur: parseInt(parts[3]) || 0,
            dow: parseInt(parts[4]) || 0,
            en: true,
          });
        } else if (parts.length === 6) {
          schedules.push({
            index: parseInt(parts[0]) || index,
            hour: parseInt(parts[1]) || 0,
            min: parseInt(parts[2]) || 0,
            dur: parseInt(parts[3]) || 0,
            dow: parseInt(parts[4]) || 0,
            en: parts[5] === '1' || parts[5].toLowerCase() === 'true',
          });
        }
      } else if (item && typeof item === 'object') {
        schedules.push({
          index: item.index !== undefined ? item.index : index,
          hour: item.hour || item.HOUR || item.h || 0,
          min: item.min || item.MIN || item.m || 0,
          dur: item.dur || item.DUR || item.d || item.duration || 0,
          dow: item.dow || item.DOW || item.w || item.daysofweek || 0,
          en: true,
        });
      }
    });

    return schedules;
  };

  // Save schedules for a specific device
  const saveSchedulesForDevice = async (deviceName, deviceSchedules) => {
    const allSchedules = schedulesRef.current;
    allSchedules[deviceName] = deviceSchedules;
    schedulesRef.current = allSchedules;

    setSchedules({ ...allSchedules });

    try {
      await SecureStore.setItemAsync(`schedules_${deviceName}`, JSON.stringify(deviceSchedules));
    } catch (error) {
      console.error('Error saving schedules:', error);
    }
  };

  // Load schedules for a specific device
  const loadSchedulesForDevice = async deviceName => {
    try {
      const savedSchedules = await SecureStore.getItemAsync(`schedules_${deviceName}`);
      if (savedSchedules) {
        const parsedSchedules = JSON.parse(savedSchedules);
        if (Array.isArray(parsedSchedules)) {
          saveSchedulesForDevice(deviceName, parsedSchedules);
        }
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  // Get schedules for current device
  const getCurrentDeviceSchedules = () => {
    if (!currentDevice)
      return Array(10)
        .fill(null)
        .map((_, index) => ({
          index,
          hour: 0,
          min: 0,
          dur: 0,
          dow: 0,
          en: 0,
        }));

    return (
      schedules[currentDevice] ||
      Array(10)
        .fill(null)
        .map((_, index) => ({
          index,
          hour: 0,
          min: 0,
          dur: 0,
          dow: 0,
          en: 0,
        }))
    );
  };

  // Get next run time for current device
  const getCurrentDeviceNextRunTime = () => {
    if (!currentDevice) return 'N/A';
    return nextRunTimes[currentDevice] || 'N/A';
  };

  // Initialize MQTT connection
  useEffect(() => {
    const initializeMqtt = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (config) {
        const { mqttServer, mqttUser, mqttPassword } = JSON.parse(config);

        const mqttClient = new Paho.Client(
          mqttServer,
          8884,
          `clientId-${Math.random().toString(36).substr(2, 8)}`
        );

        mqttClient.onMessageArrived = message => {
          const topic = message.destinationName;
          const deviceName = extractDeviceName(topic);
          const payload = message.payloadString.trim();

          // Handle device heartbeat
          if (topic.endsWith('/heartbeat')) {
            if (deviceName) {
              addNewDevice(deviceName);
              setIsOnline(true);
            } else if (topic === topics.heartbeat) {
              setIsOnline(true);
            }
          }
          // Handle next schedule due time
          else if (topic.endsWith('/next_schedule_due')) {
            if (deviceName) {
              // Parse the payload using parseStringPayload to extract datetime string
              const nextRunPayload = parseStringPayload(payload);
              updateNextRunTime(deviceName, nextRunPayload);
              // Stop refresh animation when we get a response
              refreshingNextRunRef.current = false;
              setRefreshingNextRun(false);
            }
          }
          // Handle schedules response
          else if (topic.endsWith('/get_schedules_response')) {
            try {
              const payloadStr = message.payloadString.trim();
              const payloadArray = parseArrayPayload(payloadStr);
              const parsedSchedules = parseSchedulesFromPayload(payloadArray);

              // Build all 10 schedule slots (empty or with data)
              const allSchedules = Array(10)
                .fill(null)
                .map((_, index) => {
                  const foundSchedule = parsedSchedules.find(s => s.index === index);
                  return (
                    foundSchedule || {
                      index,
                      hour: 0,
                      min: 0,
                      dur: 0,
                      dow: 0,
                      en: 0,
                    }
                  );
                });

              if (deviceName) {
                // Ensure device is in the list and set as current
                addNewDevice(deviceName);
                saveSchedulesForDevice(deviceName, allSchedules);
              } else {
                saveSchedulesForDevice('default', allSchedules);
                if (devicesRef.current.size === 0) {
                  addNewDevice('default');
                }
              }
            } catch (error) {
              // Silent fail - schedules will show from local storage
            }

            setIsLoading(false);
          }
          // Handle legacy schedule response
          else if (topic === topics.getSchedulesResponse) {
            try {
              const payloadStr = message.payloadString.trim();
              const payloadArray = parseArrayPayload(payloadStr);
              const parsedSchedules = parseSchedulesFromPayload(payloadArray);

              // Build all 10 schedule slots (empty or with data)
              const allSchedules = Array(10)
                .fill(null)
                .map((_, index) => {
                  const foundSchedule = parsedSchedules.find(s => s.index === index);
                  return (
                    foundSchedule || {
                      index,
                      hour: 0,
                      min: 0,
                      dur: 0,
                      dow: 0,
                      en: 0,
                    }
                  );
                });

              saveSchedulesForDevice('default', allSchedules);
              if (devicesRef.current.size === 0) {
                addNewDevice('default');
              }
            } catch (error) {
              console.error('❌ Error parsing legacy schedules:', error);
            }

            setIsLoading(false);
          }
        };

        mqttClient.onConnectionLost = responseObject => {
          console.log('Connection lost:', responseObject.errorMessage);
          setIsOnline(false);
        };

        mqttClient.connect({
          onSuccess: () => {
            setIsOnline(true);

            // Subscribe to topics
            mqttClient.subscribe(topics.deviceGetSchedulesResponsePattern);
            mqttClient.subscribe(topics.deviceHeartbeatPattern);
            mqttClient.subscribe(topics.deviceNextSchedulePattern);
            mqttClient.subscribe(topics.getSchedulesResponse);
            mqttClient.subscribe(topics.heartbeat);

            // Load saved devices and then request schedules
            loadSavedDevices(mqttClient);
          },
          onFailure: err => {
            console.error('Connection failed:', err);
            Alert.alert(
              'Connection Error',
              'Failed to connect to MQTT server. Showing locally saved schedules.'
            );
            setIsOnline(false);
            setIsLoading(false);
            // Load locally stored schedules even when offline
            loadSavedDevices(null);
          },
          useSSL: true,
          userName: mqttUser,
          password: mqttPassword,
          reconnect: true,
          keepAliveInterval: 30,
        });

        setClient(mqttClient);
      } else {
        Alert.alert(
          'Configuration Missing',
          'Please configure MQTT settings first. Showing locally saved schedules.'
        );
        setIsLoading(false);
        // Load locally stored schedules even without MQTT config
        loadSavedDevices(null);
      }
    };

    initializeMqtt();

    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, []);

  // Load saved devices from SecureStore
  const loadSavedDevices = async mqttClient => {
    try {
      const savedDevices = await SecureStore.getItemAsync('scheduler_devices');
      if (savedDevices) {
        const parsedDevices = JSON.parse(savedDevices);
        if (Array.isArray(parsedDevices) && parsedDevices.length > 0) {
          parsedDevices.forEach(device => {
            devicesRef.current.add(device);
          });

          const deviceArray = Array.from(devicesRef.current);
          setDevices(deviceArray);

          // Initialize next run times for all devices
          const times = {};
          deviceArray.forEach(device => {
            times[device] = 'N/A';
          });
          nextRunTimesRef.current = times;
          setNextRunTimes(times);

          if (deviceArray.length > 0) {
            const firstDevice = deviceArray[0];
            setCurrentDevice(firstDevice);
            // Load locally stored schedules first (shown immediately)
            loadSchedulesForDevice(firstDevice);

            // Request fresh schedules from device via MQTT (will update if received)
            if (mqttClient && mqttClient.isConnected()) {
              setIsLoading(true);
              setTimeout(() => {
                try {
                  const message = new Paho.Message('');
                  message.destinationName = `${firstDevice}/get_schedules`;
                  message.qos = 1;
                  mqttClient.send(message);

                  // Timeout: clear loading if no response, keep showing local schedules
                  setTimeout(() => {
                    setIsLoading(false);
                  }, 5000);
                } catch (error) {
                  console.error('Error requesting schedules on load:', error);
                  setIsLoading(false);
                }
              }, 500);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading saved devices:', error);
    }
  };

  const requestSchedules = () => {
    if (!client || !client.isConnected()) {
      Alert.alert('Offline', 'Not connected to MQTT server');
      return;
    }

    setIsLoading(true);

    try {
      const message = new Paho.Message('');

      if (currentDevice && currentDevice !== 'default') {
        message.destinationName = `${currentDevice}/get_schedules`;
      } else {
        message.destinationName = topics.requestSchedules;
      }

      message.qos = 1;
      client.send(message);

      // Timeout if no response
      setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          Alert.alert('Timeout', 'No response from device');
        }
      }, 5000);
    } catch (error) {
      console.error('Error sending request:', error);
      setIsLoading(false);
    }
  };

  const saveSchedule = () => {
    if (!client || !client.isConnected()) {
      Alert.alert('Error', 'Not connected to device');
      return;
    }

    const { index, hour, min, dur, dow, en } = currentSchedule;
    const payload = `${index}:${hour}:${min}:${dur}:${dow}:${en ? 1 : 0}`;

    const message = new Paho.Message(payload);

    if (currentDevice && currentDevice !== 'default') {
      message.destinationName = `${currentDevice}/set_schedule`;
    } else {
      message.destinationName = topics.setSchedule;
    }

    message.qos = 1;
    client.send(message);

    // Update local state
    const currentSchedules = getCurrentDeviceSchedules();
    const updatedSchedules = [...currentSchedules];
    updatedSchedules[index] = { ...currentSchedule };

    if (currentDevice) {
      saveSchedulesForDevice(currentDevice, updatedSchedules);
    }

    setModalVisible(false);

    // Refresh schedules (next run time is auto-published by device)
    setTimeout(() => {
      requestSchedules();
    }, 1000);
  };

  const deleteSchedule = index => {
    if (!client || !client.isConnected()) {
      Alert.alert('Error', 'Not connected to device');
      return;
    }

    const payload = `${index}:0:0:0:0:0`;
    const message = new Paho.Message(payload);

    if (currentDevice && currentDevice !== 'default') {
      message.destinationName = `${currentDevice}/set_schedule`;
    } else {
      message.destinationName = topics.setSchedule;
    }

    message.qos = 1;
    client.send(message);

    // Update local state
    const currentSchedules = getCurrentDeviceSchedules();
    const updatedSchedules = [...currentSchedules];
    updatedSchedules[index] = {
      index,
      hour: 0,
      min: 0,
      dur: 0,
      dow: 0,
      en: 0,
    };

    if (currentDevice) {
      saveSchedulesForDevice(currentDevice, updatedSchedules);
    }

    // Refresh schedules (next run time is auto-published by device)
    setTimeout(() => {
      requestSchedules();
    }, 1000);
  };

  const switchDevice = deviceName => {
    setCurrentDevice(deviceName);
    setIsLoading(true);

    loadSchedulesForDevice(deviceName);

    setTimeout(() => {
      requestSchedules();
      // Also request next run time when switching devices
      requestNextRunTime();
    }, 500);
  };

  const toggleDay = day => {
    const dayValue = daysValues[day];
    const newDow = currentSchedule.dow ^ dayValue;
    setCurrentSchedule({ ...currentSchedule, dow: newDow });
  };

  const isDaySelected = day => {
    return (currentSchedule.dow & daysValues[day]) !== 0;
  };

  const formatTime = (hour, min) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`;
  };

  const formatDays = dow => {
    if (dow === 0) return 'Never';
    if (dow === 127) return 'Every day';

    const selectedDays = [];
    Object.entries(daysValues).forEach(([day, value]) => {
      if (dow & value) {
        selectedDays.push(day.substring(0, 3));
      }
    });
    return selectedDays.join(', ');
  };

  // Get schedules for current device to display
  const displaySchedules = getCurrentDeviceSchedules().filter(
    s => s.dur > 0 || s.hour > 0 || s.min > 0
  );
  const displaySchedulesCount = displaySchedules.length;
  const nextRunTime = getCurrentDeviceNextRunTime();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#f8f9fa' />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Scheduler</Text>
          <Text style={styles.scheduleCount}>
            {currentDevice
              ? `${displaySchedulesCount} schedule${displaySchedulesCount !== 1 ? 's' : ''}`
              : 'No device'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={requestSchedules}
            style={[styles.refreshButton, (isLoading || !isOnline) && styles.refreshButtonDisabled]}
            disabled={isLoading || !isOnline}
          >
            <MaterialIcons name='refresh' size={22} color={isOnline ? '#5E72E4' : '#CBD5E0'} />
          </TouchableOpacity>
          <View
            style={[styles.statusIndicator, { backgroundColor: isOnline ? '#4CAF50' : '#F44336' }]}
          >
            <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
          </View>
        </View>
      </View>

      {/* Compact Device Selection */}
      {devices.length > 0 && (
        <View style={styles.deviceSection}>
          <Text style={styles.deviceSectionTitle}>Active Device</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.deviceScrollView}
          >
            {devices.map((device, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.deviceChip, currentDevice === device && styles.deviceChipActive]}
                onPress={() => switchDevice(device)}
              >
                <MaterialIcons
                  name='device-hub'
                  size={14}
                  color={currentDevice === device ? 'white' : '#5E72E4'}
                />
                <Text
                  style={[
                    styles.deviceChipText,
                    currentDevice === device && styles.deviceChipTextActive,
                  ]}
                >
                  {device}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Next Run Time Display - Now Clickable */}
      {currentDevice && isOnline && (
        <TouchableOpacity
          style={[styles.nextRunContainer, refreshingNextRun && styles.nextRunContainerRefreshing]}
          onPress={requestNextRunTime}
          activeOpacity={0.7}
          disabled={refreshingNextRun}
        >
          <View style={styles.nextRunIcon}>
            {refreshingNextRun ? (
              <MaterialIcons
                name='refresh'
                size={20}
                color='#5E72E4'
                style={styles.refreshingIcon}
              />
            ) : (
              <MaterialIcons name='schedule' size={18} color='#5E72E4' />
            )}
          </View>
          <View style={styles.nextRunTextContainer}>
            <View style={styles.nextRunHeader}>
              <Text style={styles.nextRunLabel}>Next run:</Text>
              <MaterialIcons
                name='refresh'
                size={14}
                color='#718096'
                style={styles.refreshIndicator}
              />
            </View>
            <Text style={styles.nextRunTime}>
              {refreshingNextRun ? 'Refreshing...' : formatNextRunTime(nextRunTime)}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Add Schedule Button */}
        <TouchableOpacity
          style={[
            styles.addButton,
            (!isOnline || !currentDevice || displaySchedulesCount >= 10) &&
              styles.addButtonDisabled,
          ]}
          onPress={() => {
            if (!currentDevice) {
              Alert.alert('No Device', 'Please select a device first');
              return;
            }

            const currentSchedules = getCurrentDeviceSchedules();
            const availableIndex = currentSchedules.findIndex(
              s => s.dur === 0 && s.hour === 0 && s.min === 0
            );
            if (availableIndex !== -1) {
              setCurrentSchedule({
                index: availableIndex,
                hour: 8,
                min: 0,
                dur: 60,
                dow: 62,
                en: 1,
              });
              setModalVisible(true);
            } else {
              Alert.alert('Limit Reached', 'Maximum 10 schedules per device');
            }
          }}
          disabled={!isOnline || !currentDevice || displaySchedulesCount >= 10}
        >
          <MaterialIcons name='add-circle-outline' size={24} color='white' />
          <Text style={styles.addButtonText}>New Schedule</Text>
        </TouchableOpacity>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <MaterialIcons name='schedule' size={28} color='#5E72E4' />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Schedules List */}
        {currentDevice ? (
          displaySchedulesCount > 0 ? (
            <View style={styles.schedulesList}>
              {displaySchedules
                .sort((a, b) => a.index - b.index)
                .map(schedule => (
                  <View key={schedule.index} style={styles.scheduleCard}>
                    <View style={styles.scheduleHeader}>
                      <View style={styles.scheduleIndex}>
                        <Text style={styles.scheduleIndexText}>#{schedule.index + 1}</Text>
                      </View>
                      <View style={styles.scheduleTimeContainer}>
                        <Text style={styles.scheduleTime}>
                          {formatTime(schedule.hour, schedule.min)}
                        </Text>
                        <Text style={styles.scheduleDuration}>{schedule.dur}s</Text>
                      </View>
                      <View style={styles.scheduleActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => {
                            setCurrentSchedule({ ...schedule });
                            setModalVisible(true);
                          }}
                        >
                          <MaterialIcons name='edit' size={20} color='#5E72E4' />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => deleteSchedule(schedule.index)}
                        >
                          <MaterialIcons name='delete' size={20} color='#F44336' />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.scheduleDays}>{formatDays(schedule.dow)}</Text>
                  </View>
                ))}
            </View>
          ) : (
            !isLoading && (
              <View style={styles.emptyState}>
                <MaterialIcons name='schedule' size={60} color='#E2E8F0' />
                <Text style={styles.emptyText}>No Schedules</Text>
                <Text style={styles.emptySubtext}>Add a schedule to automate watering</Text>
              </View>
            )
          )
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name='devices' size={60} color='#E2E8F0' />
            <Text style={styles.emptyText}>No Device Selected</Text>
            <Text style={styles.emptySubtext}>
              {devices.length > 0 ? 'Select a device above' : 'Waiting for devices...'}
            </Text>
          </View>
        )}
      </ScrollView>
      {/* Schedule Modal */}
      <Modal
        visible={modalVisible}
        animationType='slide'
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Schedule</Text>
                {currentDevice && <Text style={styles.modalSubtitle}>Device: {currentDevice}</Text>}
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <MaterialIcons name='close' size={24} color='#4A5568' />
              </TouchableOpacity>
            </View>

            {/* Time Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Start Time</Text>
              <TouchableOpacity style={styles.timeInput} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.timeInputText}>
                  {formatTime(currentSchedule.hour, currentSchedule.min)}
                </Text>
                <MaterialIcons name='access-time' size={20} color='#5E72E4' />
              </TouchableOpacity>
            </View>

            {showTimePicker && (
              <DateTimePicker
                value={
                  new Date(
                    new Date().getFullYear(),
                    new Date().getMonth(),
                    new Date().getDate(),
                    currentSchedule.hour,
                    currentSchedule.min
                  )
                }
                mode='time'
                display='spinner'
                onChange={(event, selectedTime) => {
                  setShowTimePicker(false);
                  if (selectedTime) {
                    const hours = selectedTime.getHours();
                    const minutes = selectedTime.getMinutes();
                    setCurrentSchedule({
                      ...currentSchedule,
                      hour: hours,
                      min: minutes,
                    });
                  }
                }}
              />
            )}

            {/* Duration Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Duration (seconds)</Text>
              <View style={styles.durationContainer}>
                <TextInput
                  style={styles.durationInput}
                  keyboardType='numeric'
                  value={String(currentSchedule.dur)}
                  onChangeText={text =>
                    setCurrentSchedule({
                      ...currentSchedule,
                      dur: parseInt(text) || 0,
                    })
                  }
                  maxLength={4}
                />
                <Text style={styles.durationUnit}>sec</Text>
              </View>
            </View>

            {/* Days Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Repeat on</Text>
              <View style={styles.daysContainer}>
                {Object.keys(daysValues).map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayChip, isDaySelected(day) && styles.dayChipActive]}
                    onPress={() => toggleDay(day)}
                  >
                    <Text
                      style={isDaySelected(day) ? styles.dayChipTextActive : styles.dayChipText}
                    >
                      {day.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.daysSummary}>{formatDays(currentSchedule.dow)}</Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!isOnline || !currentDevice) && styles.saveButtonDisabled,
                ]}
                onPress={saveSchedule}
                disabled={!isOnline || !currentDevice}
              >
                <Text style={styles.saveButtonText}>
                  {!currentDevice ? 'No Device' : !isOnline ? 'Offline' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 6,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#5E72E4',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 20,
    padding: 14,
  },
  addButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  addButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    marginRight: 8,
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: '#4A5568',
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  closeModalButton: {
    alignItems: 'center',
    backgroundColor: '#5E72E4',
    borderRadius: 10,
    flex: 1,
    marginLeft: 8,
    paddingVertical: 12,
  },
  closeModalButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#f8f9fa',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dayChip: {
    backgroundColor: '#F8F9FA',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayChipActive: {
    backgroundColor: '#5E72E4',
    borderColor: '#5E72E4',
  },
  dayChipText: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: 'white',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  daysSummary: {
    color: '#5E72E4',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
  },
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
  deviceChipText: {
    color: '#5E72E4',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  deviceChipTextActive: {
    color: 'white',
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
  durationContainer: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  durationInput: {
    backgroundColor: '#F8F9FA',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    marginRight: 12,
    padding: 14,
  },
  durationUnit: {
    color: '#718096',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptySubtext: {
    color: '#718096',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyText: {
    color: '#4A5568',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerTitle: {
    color: '#2D3748',
    fontSize: 24,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#4A5568',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    padding: 24,
  },
  loadingText: {
    color: '#4A5568',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxWidth: 400,
    padding: 24,
    width: '100%',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxWidth: 400,
    padding: 24,
    width: '100%',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalSubtitle: {
    color: '#718096',
    fontSize: 12,
    marginTop: 4,
  },
  modalTitle: {
    color: '#2D3748',
    fontSize: 20,
    fontWeight: '700',
  },
  nextRunContainer: {
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderBottomColor: '#C3DDFD',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  nextRunContainerRefreshing: {
    backgroundColor: '#E6F7FF',
  },
  nextRunDetailRow: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  nextRunDetailText: {
    color: '#4A5568',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
  nextRunHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 2,
  },
  nextRunIcon: {
    marginRight: 12,
  },
  nextRunLabel: {
    color: '#4A5568',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  nextRunModalFooter: {
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 20,
  },
  nextRunTextContainer: {
    flex: 1,
  },
  nextRunTime: {
    color: '#2D3748',
    fontSize: 14,
    fontWeight: '700',
  },
  noScheduleContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    width: '100%',
  },
  noScheduleSubtext: {
    color: '#718096',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  noScheduleText: {
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  refreshButton: {
    borderRadius: 6,
    padding: 6,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  refreshButtonModal: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  refreshButtonText: {
    color: '#5E72E4',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  refreshButtonTextDisabled: {
    color: '#CBD5E0',
  },
  refreshIndicator: {
    opacity: 0.7,
  },
  refreshingIcon: {
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationKeyframes: [
      {
        '0%': { transform: [{ rotate: '0deg' }] },
        '100%': { transform: [{ rotate: '360deg' }] },
      },
    ],
    animationTimingFunction: 'linear',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#5E72E4',
    borderRadius: 10,
    flex: 1,
    marginLeft: 8,
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  scheduleActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  scheduleCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    marginBottom: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  scheduleCount: {
    color: '#718096',
    fontSize: 13,
    marginTop: 2,
  },
  scheduleDays: {
    color: '#4A5568',
    fontSize: 13,
  },
  scheduleDuration: {
    color: '#718096',
    fontSize: 14,
    marginTop: 2,
  },
  scheduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  scheduleIndex: {
    backgroundColor: '#5E72E4',
    borderRadius: 6,
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scheduleIndexText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  scheduleTime: {
    color: '#2D3748',
    fontSize: 17,
    fontWeight: '600',
  },
  scheduleTimeContainer: {
    flex: 1,
  },
  schedulesList: {
    paddingBottom: 30,
  },
  statusIndicator: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  timeInput: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  timeInputText: {
    color: '#2D3748',
    fontSize: 16,
    fontWeight: '500',
  },
  timestampContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginTop: 16,
    padding: 16,
    width: '100%',
  },
  timestampLabel: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  timestampValue: {
    color: '#4A5568',
    fontFamily: 'monospace',
    fontSize: 14,
  },
});

export default SchedulerPage;
