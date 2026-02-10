import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, SafeAreaView } from 'react-native';
import Timeline from 'react-native-timeline-flatlist';
import Paho from 'paho-mqtt';
import * as SecureStore from 'expo-secure-store';

const TimelinePage = () => {
  const [timelineData, setTimelineData] = useState([]);
  const [isDeviceOnline, setIsDeviceOnline] = useState(true);
  const [lastHeartbeatTimestamp, setLastHeartbeatTimestamp] = useState(Date.now());
  const [client, setClient] = useState(null);
  const [savedData, setSavedData] = useState({
    pumpStatus: 'OFF',
    pumpTime: '',
    mqttServer: '',
    mqttPort: '',
    mqttUser: '',
    mqttPassword: '',
    scheduler: '',
  });

  // MQTT Configuration
  const mqttPort = 8884; // WebSocket port (default for HiveMQ)
  const pumpStatusTopic = 'beegreen/pump_status';
  const heartbeatTopic = 'beegreen/heartbeat';

  // Fetch MQTT details from SecureStore
  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        setSavedData({
          mqttServer: parsedConfig.mqttServer || '',
          mqttPort: parsedConfig.mqttPort || '',
          mqttUser: parsedConfig.mqttUser || '',
          mqttPassword: parsedConfig.mqttPassword || '',
          pumpTime: parsedConfig.pumpTime || '',
          scheduler: parsedConfig.scheduler || '',
          pumpStatus: parsedConfig.pumpStatus || '',
        });
      }
    };

    fetchSavedData();
  }, []);

  // Initialize MQTT client
  useEffect(() => {
    if (savedData.mqttServer) {
      const mqttClient = new Paho.Client(
        savedData.mqttServer,
        mqttPort,
        'clientId-' + Math.random().toString(16).substr(2, 8)
      );

      // Set callback handlers
      // mqttClient.onConnectionLost = onConnectionLost;
      mqttClient.onMessageArrived = onMessageArrived;

      // Connect to the MQTT broker
      mqttClient.connect({
        onSuccess: () => {
          console.log('Connected to MQTT broker in timeline page');
          setIsDeviceOnline(true);
          // mqttClient.subscribe(pumpStatusTopic);
          // mqttClient.subscribe(heartbeatTopic);
        },
        onFailure: err => {
          console.error('Failed to connect to MQTT broker', err);
          setIsDeviceOnline(false);
        },
        useSSL: true,
        userName: savedData.mqttUser,
        password: savedData.mqttPassword,
      });

      setClient(mqttClient);

      // Cleanup on unmount
      return () => {
        if (mqttClient.isConnected()) {
          mqttClient.disconnect();
        }
      };
    }
  }, [savedData]);

  const onConnectionLost = responseObject => {
    if (responseObject.errorCode !== 0) {
      console.error('Connection lost:', responseObject.errorMessage);
      setIsDeviceOnline(false);
    }
  };

  const onMessageArrived = message => {
    const data = JSON.parse(message.payloadString);

    if (message.destinationName === pumpStatusTopic) {
      // Add pump status to timeline
      setTimelineData(prevData => [
        ...prevData,
        {
          time: new Date(data.timestamp).toLocaleTimeString(),
          title: `Pump ${data.payload}`,
          description: `Timestamp: ${new Date(data.timestamp).toLocaleString()}`,
          icon: data.payload === 'on' ? 'power' : 'power-off',
        },
      ]);
    } else if (message.destinationName === heartbeatTopic) {
      // Update last heartbeat timestamp
      setLastHeartbeatTimestamp(Date.now());

      // Mark device as online
      if (!isDeviceOnline) {
        setIsDeviceOnline(true);
        setTimelineData(prevData => [
          ...prevData,
          {
            time: new Date().toLocaleTimeString(),
            title: 'Device Online',
            description: `Timestamp: ${new Date().toLocaleString()}`,
            icon: 'wifi',
          },
        ]);
      }
    }
  };

  // Check for device offline status
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastHeartbeatTimestamp > 60000 && isDeviceOnline) {
        setIsDeviceOnline(false);
        setTimelineData(prevData => [
          ...prevData,
          {
            time: new Date().toLocaleTimeString(),
            title: 'Device Offline',
            description: `Timestamp: ${new Date().toLocaleString()}`,
            icon: 'wifi-off',
          },
        ]);
      }

      const onMessageArrived = message => {
        const data = JSON.parse(message.payloadString);

        if (message.destinationName === pumpStatusTopic) {
          // Add pump status to timeline
          setTimelineData(prevData => [
            ...prevData,
            {
              time: new Date(data.timestamp).toLocaleTimeString(),
              title: `Pump ${data.payload}`,
              description: `Timestamp: ${new Date(data.timestamp).toLocaleString()}`,
              icon: data.payload === 'on' ? 'power' : 'power-off',
            },
          ]);
        } else if (message.destinationName === heartbeatTopic) {
          // Update last heartbeat timestamp
          setLastHeartbeatTimestamp(Date.now());

          // Mark device as online
          if (!isDeviceOnline) {
            setIsDeviceOnline(true);
            setTimelineData(prevData => [
              ...prevData,
              {
                time: new Date().toLocaleTimeString(),
                title: 'Device Online',
                description: `Timestamp: ${new Date().toLocaleString()}`,
                icon: 'wifi',
              },
            ]);
          }
        }
      };
    }, 6000); // Check every second

    return () => clearInterval(interval);
  }, [lastHeartbeatTimestamp, isDeviceOnline]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Pump Status Timeline</Text>
      <Timeline
        data={timelineData}
        circleSize={20}
        circleColor={isDeviceOnline ? 'green' : 'red'}
        lineColor='gray'
        timeStyle={styles.time}
        titleStyle={styles.title}
        descriptionStyle={styles.description}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    padding: 20,
  },
  description: {
    color: 'gray',
    fontSize: 14,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  time: {
    backgroundColor: '#ff9797',
    borderRadius: 13,
    color: 'white',
    padding: 5,
    textAlign: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default TimelinePage;
