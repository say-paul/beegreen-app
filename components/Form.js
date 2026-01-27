import React, { useState, useEffect } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { View, StyleSheet, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';

const Form = ({ navigation }) => {
  const [savedData, setSavedData] = useState(null);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission state

  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (!config) {
        navigation.replace('Login'); // Redirect to Login if no config
      } else {
        const parsedConfig = JSON.parse(config);
        setSavedData(parsedConfig);
      }
    };

    fetchSavedData();
  }, [navigation]);

  const handleDelete = async () => {
    // Delete the saved data
    await SecureStore.deleteItemAsync('config');

    // Clear the savedData state
    setSavedData(null);
  };

  const handleWebViewMessage = async event => {
    console.log('Received message from WebView:', event.nativeEvent.data); // Debugging

    // Block submission if already in progress
    if (isSubmitting) {
      console.log('Submission already in progress. Ignoring duplicate request.');
      return;
    }

    // Mark submission as in progress
    setIsSubmitting(true);

    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Parsed data:', data); // Debugging

      const config = {
        wifiSSID: data.s,
        wifiPassword: data.p,
        mqttServer: data.mqtt_server,
        mqttPort: data.mqtt_port,
        mqttUser: data.username,
        mqttPassword: data.password,
      };
      console.log('Parsed config:', config); // Debugging

      // Prepare the form data for the POST request
      const formData = new URLSearchParams();
      formData.append('s', data.s); // SSID
      formData.append('p', data.p); // Wi-Fi password
      formData.append('mqtt_server', data.mqtt_server); // MQTT server
      formData.append('mqtt_port', data.mqtt_port); // MQTT port
      formData.append('username', data.username); // MQTT username
      formData.append('password', data.password); // MQTT password

      console.log('Form data to send:', formData.toString()); // Debugging

      // Send the POST request
      // const response = await fetch("http://192.168.1.13:5000/wifisave", {
      const response = await fetch('http://192.168.4.1/wifisave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      console.log('Response status:', response.status); // Debugging

      if (response.ok) {
        // Save the configuration to SecureStore
        await SecureStore.setItemAsync('config', JSON.stringify(config));
        setSavedData(config);
        console.log('Navigating to Control screen'); // Debugging
        navigation.replace('Control'); // Navigate to Control page
      } else {
        alert('Failed to save configuration. Please try again.');
      }
    } catch (error) {
      console.error('Error parsing WebView message or sending POST request:', error);
    } finally {
      // Reset submission state
      setIsSubmitting(false);
    }
  };

  return savedData ? (
    <SafeAreaView style={styles.container}>
      <View style={styles.savedDataContainer}>
        <Text style={styles.savedDataText}>MQTT User: {savedData.mqttUser}</Text>
        <Text style={styles.savedDataText}>MQTT Server: {savedData.mqttServer}</Text>
        <Text style={styles.savedDataText}>MQTT Port: {savedData.mqttPort}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <MaterialIcons name='delete' size={24} color='red' />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  ) : (
    <>
      {showTimeoutMessage ? (
        <SafeAreaView style={styles.container}>
          <View style={styles.timeoutMessageContainer}>
            <Text style={styles.timeoutMessageText}>
              Check if Wi-Fi is connected to BeeGreen...
            </Text>
          </View>
        </SafeAreaView>
      ) : (
        <WebView
          // source={{ uri: "http://192.168.1.13:5000" }}
          source={{ uri: 'http://192.168.4.1/wifi' }}
          allowsFullscreenVideo={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={handleWebViewMessage}
          injectedJavaScript={`
              // Intercept form submission
              document.querySelector('form').addEventListener('submit', (event) => {
                event.preventDefault(); // Prevent default form submission

                // Disable the submit button to prevent multiple submissions
                const submitButton = document.querySelector('button[type="submit"]');
                submitButton.disabled = true;

                // Collect form data
                const formData = new FormData(event.target);
                const data = {};
                formData.forEach((value, key) => {
                  data[key] = value;
                });

                console.log("Form data:", data); // Debugging

                // Send data to React Native app
                window.ReactNativeWebView.postMessage(JSON.stringify(data));
              });

              // Notify React Native that the script has been injected
              window.ReactNativeWebView.postMessage("WebView script injected");
            `}
          onError={error => {
            console.error('WebView error:', error); // Debugging
            setShowTimeoutMessage(true); // Show error message
          }}
          onLoadEnd={() => {
            console.log('WebView loaded'); // Debugging
            setWebViewLoaded(true); // Mark WebView as loaded
          }}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#228B22',
    flex: 1,
    justifyContent: 'center',
  },
  deleteButton: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  savedDataContainer: {
    backgroundColor: '#fff',
    borderRadius: 5,
    marginTop: 30,
    padding: 15,
    position: 'relative',
    width: '80%', // For positioning the delete button
  },
  savedDataText: {
    color: '#000',
    fontSize: 16,
    marginBottom: 10,
  },
  timeoutMessageContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  timeoutMessageText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
});

export default Form;
