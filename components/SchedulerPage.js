import React, { useState, useEffect, useRef } from "react";
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
  Alert
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import Paho from "paho-mqtt";
import * as SecureStore from "expo-secure-store";
import * as Notifications from 'expo-notifications';

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
    en: 1
  });
  const [currentDevice, setCurrentDevice] = useState("");
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [nextRunTimes, setNextRunTimes] = useState({});
  const [nextRunModalVisible, setNextRunModalVisible] = useState(false); // New modal state
  const [refreshingNextRun, setRefreshingNextRun] = useState(false);

  // MQTT Topics
  const topics = {
    setSchedule: "beegreen/set_schedule",
    requestSchedules: "beegreen/get_schedules",
    getSchedulesResponse: "beegreen/get_schedules_response",
    heartbeat: "beegreen/heartbeat",
    deviceSetSchedulePattern: "+/set_schedule",
    deviceRequestSchedulesPattern: "+/get_schedules",
    deviceGetSchedulesResponsePattern: "+/get_schedules_response",
    deviceHeartbeatPattern: "+/heartbeat",
    deviceNextSchedulePattern: "+/next_schedule_due",
    deviceRequestNextSchedule: "+/get_next_schedule_due"
  };

  // Refs
  const devicesRef = useRef(new Set());
  const schedulesRef = useRef({});
  const nextRunTimesRef = useRef({});

  // Days of week values for bitmask
  const daysValues = {
    Sunday: 1,
    Monday: 2,
    Tuesday: 4,
    Wednesday: 8,
    Thursday: 16,
    Friday: 32,
    Saturday: 64
  };

  // Extract device name from topic
  const extractDeviceName = (topic) => {
    const parts = topic.split('/');
    return parts.length > 0 ? parts[0] : null;
  };

  // Format next run time for display
  const formatNextRunTime = (timestamp) => {
    if (!timestamp || timestamp === "0" || timestamp === "N/A") {
      return "N/A";
    }
    
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      if (isNaN(date.getTime())) {
        return "N/A";
      }
      
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60000);
      
      // If within 24 hours, show relative time
      if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
        if (diffMins < 1) {
          return "Now";
        } else if (diffMins < 60) {
          return `in ${diffMins} min${diffMins !== 1 ? 's' : ''}`;
        } else {
          const hours = Math.floor(diffMins / 60);
          const minutes = diffMins % 60;
          if (minutes === 0) {
            return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
          }
          return `in ${hours}h ${minutes}m`;
        }
      }
      
      // Otherwise show date/time
      const today = now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (date.toDateString() === today) {
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (date.toDateString() === tomorrow.toDateString()) {
        return `Tomorrow, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (error) {
      console.error("Error formatting next run time:", error);
      return "N/A";
    }
  };

  // Format next run time for detailed view in modal
  const formatNextRunTimeDetailed = (timestamp) => {
    if (!timestamp || timestamp === "0" || timestamp === "N/A") {
      return {
        date: "Not scheduled",
        time: "",
        relative: "No upcoming schedule",
        timestamp: null
      };
    }
    
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      if (isNaN(date.getTime())) {
        return {
          date: "Invalid time",
          time: "",
          relative: "Invalid timestamp",
          timestamp: null
        };
      }
      
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      let relativeText = "";
      
      if (diffMs < 0) {
        relativeText = "This schedule has passed";
      } else if (diffMins < 1) {
        relativeText = "Starting now";
      } else if (diffMins < 60) {
        relativeText = `Starting in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
      } else if (diffHours < 24) {
        const remainingMins = diffMins % 60;
        relativeText = `Starting in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
        if (remainingMins > 0) {
          relativeText += ` and ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}`;
        }
      } else {
        relativeText = `Starting in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
        const remainingHours = diffHours % 24;
        if (remainingHours > 0) {
          relativeText += ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
        }
      }
      
      return {
        date: date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        relative: relativeText,
        timestamp: timestamp
      };
    } catch (error) {
      console.error("Error formatting detailed next run time:", error);
      return {
        date: "Error",
        time: "",
        relative: "Unable to parse time",
        timestamp: null
      };
    }
  };

  // Add a new device to the list
  const addNewDevice = (deviceName) => {
    if (!devicesRef.current.has(deviceName)) {
      devicesRef.current.add(deviceName);
      
      const newDevices = Array.from(devicesRef.current);
      setDevices(newDevices);
      
      // Initialize next run time for new device
      const times = { ...nextRunTimesRef.current };
      times[deviceName] = "N/A";
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
      Alert.alert("Offline", "Not connected to device");
      return;
    }
    
    setRefreshingNextRun(true);
    
    try {
      const message = new Paho.Message("");
      message.destinationName = `${currentDevice}/get_next_schedule_due`;
      message.qos = 1;
      client.send(message);
      
      console.log(`Requested next run time from ${currentDevice}`);
      
      // Timeout if no response
      setTimeout(() => {
        if (refreshingNextRun) {
          setRefreshingNextRun(false);
          Alert.alert("No Response", "Device did not respond with next run time");
        }
      }, 3000);
    } catch (error) {
      console.error("Error requesting next run time:", error);
      setRefreshingNextRun(false);
    }
  };

  // Parse schedules from payload string
  const parseSchedulesFromPayload = (payloadStr) => {
    const schedules = [];
    const cleanPayload = payloadStr.trim();
    
    if (!cleanPayload) {
      return schedules;
    }
    
    // Try to parse as JSON array
    if (cleanPayload.startsWith('[') && cleanPayload.endsWith(']')) {
      try {
        const jsonArray = JSON.parse(cleanPayload);
        
        jsonArray.forEach((item, index) => {
          if (typeof item === 'string') {
            const parts = item.split(':').map(part => part.trim());
            
            if (parts.length === 5) {
              schedules.push({
                index: parseInt(parts[0]) || index,
                hour: parseInt(parts[1]) || 0,
                min: parseInt(parts[2]) || 0,
                dur: parseInt(parts[3]) || 0,
                dow: parseInt(parts[4]) || 0,
                en: true
              });
            } else if (parts.length === 6) {
              schedules.push({
                index: parseInt(parts[0]) || index,
                hour: parseInt(parts[1]) || 0,
                min: parseInt(parts[2]) || 0,
                dur: parseInt(parts[3]) || 0,
                dow: parseInt(parts[4]) || 0,
                en: parts[5] === '1' || parts[5].toLowerCase() === 'true'
              });
            }
          } else if (item && typeof item === 'object') {
            schedules.push({
              index: item.index !== undefined ? item.index : index,
              hour: item.hour || item.HOUR || item.h || 0,
              min: item.min || item.MIN || item.m || 0,
              dur: item.dur || item.DUR || item.d || item.duration || 0,
              dow: item.dow || item.DOW || item.w || item.daysofweek || 0,
              en: true
            });
          }
        });
        return schedules;
      } catch (e) {
        console.log("Not valid JSON array:", e.message);
      }
    }
    
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
      console.error("Error saving schedules:", error);
    }
  };

  // Load schedules for a specific device
  const loadSchedulesForDevice = async (deviceName) => {
    try {
      const savedSchedules = await SecureStore.getItemAsync(`schedules_${deviceName}`);
      if (savedSchedules) {
        const parsedSchedules = JSON.parse(savedSchedules);
        if (Array.isArray(parsedSchedules)) {
          saveSchedulesForDevice(deviceName, parsedSchedules);
        }
      }
    } catch (error) {
      console.error("Error loading schedules:", error);
    }
  };

  // Get schedules for current device
  const getCurrentDeviceSchedules = () => {
    if (!currentDevice) return Array(10).fill(null).map((_, index) => ({
      index,
      hour: 0,
      min: 0,
      dur: 0,
      dow: 0,
      en: 0
    }));
    
    return schedules[currentDevice] || Array(10).fill(null).map((_, index) => ({
      index,
      hour: 0,
      min: 0,
      dur: 0,
      dow: 0,
      en: 0
    }));
  };

  // Get next run time for current device
  const getCurrentDeviceNextRunTime = () => {
    if (!currentDevice) return "N/A";
    return nextRunTimes[currentDevice] || "N/A";
  };

  // Get detailed next run info for modal
  const getNextRunDetails = () => {
    const timestamp = getCurrentDeviceNextRunTime();
    return formatNextRunTimeDetailed(timestamp);
  };

  // Initialize MQTT connection
  useEffect(() => {
    const initializeMqtt = async () => {
      const config = await SecureStore.getItemAsync("config");
      if (config) {
        const { mqttServer, mqttUser, mqttPassword } = JSON.parse(config);
        
        const mqttClient = new Paho.Client(
          mqttServer,
          8884,
          `clientId-${Math.random().toString(36).substr(2, 8)}`
        );

        mqttClient.onMessageArrived = (message) => {
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
            if (deviceName && payload) {
              updateNextRunTime(deviceName, payload);
              // Stop refresh animation when we get a response
              if (refreshingNextRun && deviceName === currentDevice) {
                setRefreshingNextRun(false);
              }
            }
          }
          // Handle schedules response
          else if (topic.endsWith('/get_schedules_response')) {
            try {
              const payloadStr = message.payloadString.trim();
              const parsedSchedules = parseSchedulesFromPayload(payloadStr);
              
              if (parsedSchedules.length > 0) {
                const allSchedules = Array(10).fill(null).map((_, index) => {
                  const foundSchedule = parsedSchedules.find(s => s.index === index);
                  return foundSchedule || {
                    index,
                    hour: 0,
                    min: 0,
                    dur: 0,
                    dow: 0,
                    en: 0
                  };
                });
                
                if (deviceName) {
                  saveSchedulesForDevice(deviceName, allSchedules);
                } else {
                  saveSchedulesForDevice("default", allSchedules);
                  if (devicesRef.current.size === 0) {
                    addNewDevice("default");
                  }
                }
              }
            } catch (error) {
              console.error("❌ Error parsing schedules:", error);
            }
            
            setIsLoading(false);
          }
          // Handle legacy schedule response
          else if (topic === topics.getSchedulesResponse) {
            try {
              const payloadStr = message.payloadString.trim();
              const parsedSchedules = parseSchedulesFromPayload(payloadStr);
              
              if (parsedSchedules.length > 0) {
                const allSchedules = Array(10).fill(null).map((_, index) => {
                  const foundSchedule = parsedSchedules.find(s => s.index === index);
                  return foundSchedule || {
                    index,
                    hour: 0,
                    min: 0,
                    dur: 0,
                    dow: 0,
                    en: 0
                  };
                });
                
                saveSchedulesForDevice("default", allSchedules);
                if (devicesRef.current.size === 0) {
                  addNewDevice("default");
                }
              }
            } catch (error) {
              console.error("❌ Error parsing legacy schedules:", error);
            }
            
            setIsLoading(false);
          }
        };

        mqttClient.onConnectionLost = (responseObject) => {
          console.log("Connection lost:", responseObject.errorMessage);
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
            
            // Load saved devices
            loadSavedDevices();
          },
          onFailure: (err) => {
            console.error("Connection failed:", err);
            Alert.alert("Connection Error", "Failed to connect to MQTT server");
            setIsOnline(false);
            setIsLoading(false);
          },
          useSSL: true,
          userName: mqttUser,
          password: mqttPassword,
          reconnect: true,
          keepAliveInterval: 30,
        });

        setClient(mqttClient);
      } else {
        Alert.alert("Configuration Missing", "Please configure MQTT settings first");
        setIsLoading(false);
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
  const loadSavedDevices = async () => {
    try {
      const savedDevices = await SecureStore.getItemAsync("scheduler_devices");
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
            times[device] = "N/A";
          });
          nextRunTimesRef.current = times;
          setNextRunTimes(times);
          
          if (deviceArray.length > 0) {
            setCurrentDevice(deviceArray[0]);
            loadSchedulesForDevice(deviceArray[0]);
          }
        }
      }
    } catch (error) {
      console.error("Error loading saved devices:", error);
    }
  };

  const requestSchedules = () => {
    if (!client || !client.isConnected()) {
      Alert.alert("Offline", "Not connected to MQTT server");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const message = new Paho.Message("");
      
      if (currentDevice && currentDevice !== "default") {
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
          Alert.alert("Timeout", "No response from device");
        }
      }, 5000);
    } catch (error) {
      console.error("Error sending request:", error);
      setIsLoading(false);
    }
  };

  const saveSchedule = () => {
    if (!client || !client.isConnected()) {
      Alert.alert("Error", "Not connected to device");
      return;
    }

    const { index, hour, min, dur, dow, en } = currentSchedule;
    const payload = `${index}:${hour}:${min}:${dur}:${dow}:${en ? 1 : 0}`;
    
    const message = new Paho.Message(payload);
    
    if (currentDevice && currentDevice !== "default") {
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
    
    // Refresh schedules and next run time
    setTimeout(() => {
      requestSchedules();
      requestNextRunTime();
    }, 1000);
  };

  const deleteSchedule = (index) => {
    if (!client || !client.isConnected()) {
      Alert.alert("Error", "Not connected to device");
      return;
    }

    const payload = `${index}:0:0:0:0:0`;
    const message = new Paho.Message(payload);
    
    if (currentDevice && currentDevice !== "default") {
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
      en: 0
    };
    
    if (currentDevice) {
      saveSchedulesForDevice(currentDevice, updatedSchedules);
    }
    
    // Refresh schedules and next run time
    setTimeout(() => {
      requestSchedules();
      requestNextRunTime();
    }, 1000);
  };

  const switchDevice = (deviceName) => {
    setCurrentDevice(deviceName);
    setIsLoading(true);
    
    loadSchedulesForDevice(deviceName);
    
    setTimeout(() => {
      requestSchedules();
      // Also request next run time when switching devices
      requestNextRunTime();
    }, 500);
  };

  const toggleDay = (day) => {
    const dayValue = daysValues[day];
    const newDow = currentSchedule.dow ^ dayValue;
    setCurrentSchedule({ ...currentSchedule, dow: newDow });
  };

  const isDaySelected = (day) => {
    return (currentSchedule.dow & daysValues[day]) !== 0;
  };

  const formatTime = (hour, min) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`;
  };

  const formatDays = (dow) => {
    if (dow === 0) return "Never";
    if (dow === 127) return "Every day";
    
    const selectedDays = [];
    Object.entries(daysValues).forEach(([day, value]) => {
      if (dow & value) {
        selectedDays.push(day.substring(0, 3));
      }
    });
    return selectedDays.join(", ");
  };

  // Handle next run button press
  const handleNextRunPress = () => {
    if (!currentDevice || !isOnline) {
      Alert.alert("Offline", "Cannot check next run time while offline");
      return;
    }
    
    // If we don't have a valid next run time, request it first
    const currentTime = getCurrentDeviceNextRunTime();
    if (currentTime === "N/A" || currentTime === "0") {
      setRefreshingNextRun(true);
      requestNextRunTime();
      
      // Open modal after a short delay
      setTimeout(() => {
        setNextRunModalVisible(true);
      }, 500);
    } else {
      setNextRunModalVisible(true);
    }
  };

  // Get schedules for current device to display
  const displaySchedules = getCurrentDeviceSchedules().filter(s => s.dur > 0 || s.hour > 0 || s.min > 0);
  const displaySchedulesCount = displaySchedules.length;
  const nextRunTime = getCurrentDeviceNextRunTime();
  const nextRunDetails = getNextRunDetails();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Scheduler</Text>
          <Text style={styles.scheduleCount}>
            {currentDevice ? `${displaySchedulesCount} schedule${displaySchedulesCount !== 1 ? 's' : ''}` : "No device"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            onPress={requestSchedules}
            style={[styles.refreshButton, (isLoading || !isOnline) && styles.refreshButtonDisabled]}
            disabled={isLoading || !isOnline}
          >
            <MaterialIcons 
              name="refresh" 
              size={22} 
              color={isOnline ? "#5E72E4" : "#CBD5E0"} 
            />
          </TouchableOpacity>
          <View style={[styles.statusIndicator, { backgroundColor: isOnline ? '#4CAF50' : '#F44336' }]}>
            <Text style={styles.statusText}>{isOnline ? "ONLINE" : "OFFLINE"}</Text>
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
                style={[
                  styles.deviceChip,
                  currentDevice === device && styles.deviceChipActive
                ]}
                onPress={() => switchDevice(device)}
              >
                <MaterialIcons 
                  name="device-hub" 
                  size={14} 
                  color={currentDevice === device ? 'white' : '#5E72E4'} 
                />
                <Text style={[
                  styles.deviceChipText,
                  currentDevice === device && styles.deviceChipTextActive
                ]}>
                  {device}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Next Run Time Button */}
      {currentDevice && isOnline && (
        <TouchableOpacity 
          style={[
            styles.nextRunButton,
            refreshingNextRun && styles.nextRunButtonRefreshing
          ]}
          onPress={handleNextRunPress}
          activeOpacity={0.8}
        >
          <View style={styles.nextRunButtonContent}>
            <MaterialIcons 
              name={refreshingNextRun ? "refresh" : "schedule"} 
              size={20} 
              color="#5E72E4" 
              style={refreshingNextRun ? styles.refreshingIcon : null}
            />
            <View style={styles.nextRunButtonTextContainer}>
              <Text style={styles.nextRunButtonLabel}>Next run:</Text>
              <Text style={styles.nextRunButtonTime}>
                {refreshingNextRun ? "Refreshing..." : formatNextRunTime(nextRunTime)}
              </Text>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={20} 
              color="#718096" 
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Main Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Add Schedule Button */}
        <TouchableOpacity 
          style={[styles.addButton, (!isOnline || !currentDevice || displaySchedulesCount >= 10) && styles.addButtonDisabled]}
          onPress={() => {
            if (!currentDevice) {
              Alert.alert("No Device", "Please select a device first");
              return;
            }
            
            const currentSchedules = getCurrentDeviceSchedules();
            const availableIndex = currentSchedules.findIndex(s => s.dur === 0 && s.hour === 0 && s.min === 0);
            if (availableIndex !== -1) {
              setCurrentSchedule({
                index: availableIndex,
                hour: 8,
                min: 0,
                dur: 60,
                dow: 62,
                en: 1
              });
              setModalVisible(true);
            } else {
              Alert.alert("Limit Reached", "Maximum 10 schedules per device");
            }
          }}
          disabled={!isOnline || !currentDevice || displaySchedulesCount >= 10}
        >
          <MaterialIcons name="add-circle-outline" size={24} color="white" />
          <Text style={styles.addButtonText}>New Schedule</Text>
        </TouchableOpacity>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <MaterialIcons name="schedule" size={28} color="#5E72E4" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Schedules List */}
        {currentDevice ? (
          displaySchedulesCount > 0 ? (
            <View style={styles.schedulesList}>
              {displaySchedules
                .sort((a, b) => a.index - b.index)
                .map((schedule) => (
                  <View key={schedule.index} style={styles.scheduleCard}>
                    <View style={styles.scheduleHeader}>
                      <View style={styles.scheduleIndex}>
                        <Text style={styles.scheduleIndexText}>#{schedule.index + 1}</Text>
                      </View>
                      <View style={styles.scheduleTimeContainer}>
                        <Text style={styles.scheduleTime}>{formatTime(schedule.hour, schedule.min)}</Text>
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
                          <MaterialIcons name="edit" size={20} color="#5E72E4" />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.actionButton}
                          onPress={() => deleteSchedule(schedule.index)}
                        >
                          <MaterialIcons name="delete" size={20} color="#F44336" />
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
                <MaterialIcons name="schedule" size={60} color="#E2E8F0" />
                <Text style={styles.emptyText}>No Schedules</Text>
                <Text style={styles.emptySubtext}>
                  Add a schedule to automate watering
                </Text>
              </View>
            )
          )
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="devices" size={60} color="#E2E8F0" />
            <Text style={styles.emptyText}>No Device Selected</Text>
            <Text style={styles.emptySubtext}>
              {devices.length > 0 
                ? "Select a device above" 
                : "Waiting for devices..."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Next Run Time Modal */}
      <Modal
        visible={nextRunModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNextRunModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.nextRunModalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Next Run Time</Text>
                {currentDevice && (
                  <Text style={styles.modalSubtitle}>Device: {currentDevice}</Text>
                )}
              </View>
              <TouchableOpacity 
                onPress={() => setNextRunModalVisible(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.nextRunModalContent}>
              <View style={styles.nextRunIconLarge}>
                <MaterialIcons name="schedule" size={48} color="#5E72E4" />
              </View>
              
              <Text style={styles.nextRunModalTitle}>
                {nextRunDetails.relative}
              </Text>
              
              {nextRunDetails.timestamp && (
                <>
                  <View style={styles.nextRunDetailRow}>
                    <MaterialIcons name="calendar-today" size={20} color="#718096" />
                    <Text style={styles.nextRunDetailText}>
                      {nextRunDetails.date}
                    </Text>
                  </View>
                  
                  <View style={styles.nextRunDetailRow}>
                    <MaterialIcons name="access-time" size={20} color="#718096" />
                    <Text style={styles.nextRunDetailText}>
                      {nextRunDetails.time}
                    </Text>
                  </View>
                  
                  {nextRunDetails.timestamp && (
                    <View style={styles.timestampContainer}>
                      <Text style={styles.timestampLabel}>Unix Timestamp:</Text>
                      <Text style={styles.timestampValue}>{nextRunDetails.timestamp}</Text>
                    </View>
                  )}
                </>
              )}
              
              {!nextRunDetails.timestamp && (
                <View style={styles.noScheduleContainer}>
                  <MaterialIcons name="info-outline" size={40} color="#CBD5E0" />
                  <Text style={styles.noScheduleText}>
                    No upcoming schedule found
                  </Text>
                  <Text style={styles.noScheduleSubtext}>
                    Add a schedule to see when the next run will occur
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.nextRunModalFooter}>
              <TouchableOpacity 
                style={styles.refreshButtonModal}
                onPress={() => {
                  requestNextRunTime();
                  // Keep modal open to show refreshing state
                }}
                disabled={refreshingNextRun}
              >
                <MaterialIcons 
                  name="refresh" 
                  size={20} 
                  color={refreshingNextRun ? "#CBD5E0" : "#5E72E4"} 
                  style={refreshingNextRun ? styles.refreshingIcon : null}
                />
                <Text style={[
                  styles.refreshButtonText,
                  refreshingNextRun && styles.refreshButtonTextDisabled
                ]}>
                  {refreshingNextRun ? "Refreshing..." : "Refresh"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.closeModalButton}
                onPress={() => setNextRunModalVisible(false)}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Schedule</Text>
                {currentDevice && (
                  <Text style={styles.modalSubtitle}>Device: {currentDevice}</Text>
                )}
              </View>
              <TouchableOpacity 
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>
            
            {/* Time Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Start Time</Text>
              <TouchableOpacity 
                style={styles.timeInput}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.timeInputText}>
                  {formatTime(currentSchedule.hour, currentSchedule.min)}
                </Text>
                <MaterialIcons name="access-time" size={20} color="#5E72E4" />
              </TouchableOpacity>
            </View>
            
            {showTimePicker && (
              <DateTimePicker
                value={new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  new Date().getDate(),
                  currentSchedule.hour,
                  currentSchedule.min
                )}
                mode="time"
                display="spinner"
                onChange={(event, selectedTime) => {
                  setShowTimePicker(false);
                  if (selectedTime) {
                    const hours = selectedTime.getHours();
                    const minutes = selectedTime.getMinutes();
                    setCurrentSchedule({
                      ...currentSchedule,
                      hour: hours,
                      min: minutes
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
                  keyboardType="numeric"
                  value={String(currentSchedule.dur)}
                  onChangeText={(text) => setCurrentSchedule({
                    ...currentSchedule,
                    dur: parseInt(text) || 0
                  })}
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
                    style={[
                      styles.dayChip,
                      isDaySelected(day) && styles.dayChipActive
                    ]}
                    onPress={() => toggleDay(day)}
                  >
                    <Text style={isDaySelected(day) ? styles.dayChipTextActive : styles.dayChipText}>
                      {day.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.daysSummary}>
                {formatDays(currentSchedule.dow)}
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveButton, (!isOnline || !currentDevice) && styles.saveButtonDisabled]}
                onPress={saveSchedule}
                disabled={!isOnline || !currentDevice}
              >
                <Text style={styles.saveButtonText}>
                  {!currentDevice ? "No Device" : !isOnline ? "Offline" : "Save"}
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
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
  },
  scheduleCount: {
    fontSize: 13,
    color: '#718096',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    padding: 6,
    borderRadius: 6,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  statusIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  deviceSection: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  deviceSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#718096',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deviceScrollView: {
    flexDirection: 'row',
  },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deviceChipActive: {
    backgroundColor: '#5E72E4',
    borderColor: '#5E72E4',
  },
  deviceChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5E72E4',
    marginLeft: 4,
  },
  deviceChipTextActive: {
    color: 'white',
  },
  nextRunButton: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  nextRunButtonRefreshing: {
    backgroundColor: '#F8FAFC',
  },
  nextRunButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  nextRunButtonTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  nextRunButtonLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '600',
    marginBottom: 2,
  },
  nextRunButtonTime: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '700',
  },
  refreshingIcon: {
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
    animationKeyframes: [
      {
        '0%': { transform: [{ rotate: '0deg' }] },
        '100%': { transform: [{ rotate: '360deg' }] },
      },
    ],
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5E72E4',
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
    marginBottom: 16,
  },
  addButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginTop: 10,
  },
  loadingText: {
    color: '#4A5568',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
  },
  schedulesList: {
    paddingBottom: 30,
  },
  scheduleCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleIndex: {
    backgroundColor: '#5E72E4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  scheduleIndexText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  scheduleTimeContainer: {
    flex: 1,
  },
  scheduleTime: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3748',
  },
  scheduleDuration: {
    fontSize: 14,
    color: '#718096',
    marginTop: 2,
  },
  scheduleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8F9FA',
  },
  scheduleDays: {
    fontSize: 13,
    color: '#4A5568',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4A5568',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  nextRunModalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  nextRunModalContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  nextRunIconLarge: {
    backgroundColor: '#EBF4FF',
    padding: 20,
    borderRadius: 50,
    marginBottom: 20,
  },
  nextRunModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    textAlign: 'center',
    marginBottom: 24,
  },
  nextRunDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    width: '100%',
  },
  nextRunDetailText: {
    fontSize: 15,
    color: '#4A5568',
    marginLeft: 12,
    fontWeight: '500',
  },
  timestampContainer: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 10,
    marginTop: 16,
    width: '100%',
  },
  timestampLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '600',
    marginBottom: 4,
  },
  timestampValue: {
    fontSize: 14,
    color: '#4A5568',
    fontFamily: 'monospace',
  },
  noScheduleContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    width: '100%',
  },
  noScheduleText: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  noScheduleSubtext: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 20,
  },
  nextRunModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  refreshButtonModal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5E72E4',
    marginLeft: 8,
  },
  refreshButtonTextDisabled: {
    color: '#CBD5E0',
  },
  closeModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#5E72E4',
  },
  closeModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
  },
  timeInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#F8F9FA',
  },
  timeInputText: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '500',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#F8F9FA',
    marginRight: 12,
  },
  durationUnit: {
    fontSize: 14,
    color: '#718096',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayChipActive: {
    backgroundColor: '#5E72E4',
    borderColor: '#5E72E4',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#718096',
  },
  dayChipTextActive: {
    color: 'white',
  },
  daysSummary: {
    fontSize: 13,
    color: '#5E72E4',
    marginTop: 12,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#5E72E4',
  },
  saveButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A5568',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
});

export default SchedulerPage;