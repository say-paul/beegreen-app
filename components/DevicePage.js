import React, { useState, useEffect } from "react";
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
  Platform
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import * as Network from "expo-network";
import Paho from "paho-mqtt";
import Constants from "expo-constants";

const DevicePage = ({ navigation }) => {
  // MQTT Connection States
  const [device, setDevice] = useState('');
//  const [mqttUser, setMqttUser] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
//  const [mqttServer, setMqttServer] = useState('');
//  const [mqttPort, setMqttPort] = useState('8884');
//  const [mqttPassword, setMqttPassword] = useState('');
  
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
  const [savedData2, setSavedData2] = useState(null);
  
  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync("config");
      if (config) {
        const parsedConfig = JSON.parse(config);
        setSavedData2(parsedConfig);
      }
    };

    fetchSavedData();
  }, []);
  
  // Enhanced fetch with Android compatibility
  const deviceFetch = async (url, options = {}) => {
    try {
      // Try regular fetch first
      const response = await fetch(url, {
        ...options,
        timeout: 10000,
        headers: {
          ...options.headers,
          'Connection': 'close'
        }
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
            text: () => Promise.resolve(xhr.responseText)
          });
        };
        
        xhr.onerror = () => reject(new Error("Network request failed"));
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        
        if (options.headers) {
          Object.entries(options.headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
        }
        
        xhr.send(options.body);
      });
    }
  };

  const checkDeviceConnection = async () => {
    try {
      // Check if connected to WiFi
      const { isConnected } = await Network.getNetworkStateAsync();
      if (!isConnected) {
        Alert.alert("Verify if your Mobile Data is disbaled");
        Alert.alert(
          "Not Connected",
          "Please connect to your BeeGreen's WiFi network first",
          [
            { text: 'Open WiFi Settings', onPress: () => Linking.openSettings() },
            { text: 'OK' }
          ]
        );
        return false;
      }

      // Verify we're on the right network (192.168.4.x)
      const ip = await Network.getIpAddressAsync();
      if (!ip.startsWith('192.168.4.')) {
        Alert.alert(
          "Wrong Network",
          `Connect to BeeGreen's WiFi network (current IP: ${ip})`,
          [
            { text: 'Open WiFi Settings', onPress: () => Linking.openSettings() },
            { text: 'OK' }
          ]
        );
        return false;
      }

      // Test if device is responding
      try {
        const ping = await deviceFetch('http://192.168.4.1', { method: 'HEAD' });
        if (!ping.ok) throw new Error("Device not responding");
        return true;
      } catch (pingError) {
        throw new Error("Device not reachable. Please ensure it's powered on");
      }
    } catch (error) {
      Alert.alert("Connection Error", error.message);
      return false;
    }
  };

  const scanWifiNetworks = async () => {
    try {
		console.log('--------logging data 0 ----------');
      setIsScanning(true);
      console.log('--------logging data 1 ----------');
      if (!(await checkDeviceConnection())) return;

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
          'http://192.168.4.1/wifi-scan'
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
        const networks = data.split('\n')
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
        throw new Error("No networks found in text response");
      }
      else if (Array.isArray(data)) {
        // Handle array response format
        setWifiNetworks(data);
        setShowWifiModal(true);
      }
      else if (data.networks) {
        // Handle object with networks property
        setWifiNetworks(data.networks);
        setShowWifiModal(true);
      }
      else {
        throw new Error("Unexpected response format");
      }
	 // console.log('device selected', data);
    } catch (error) {
      console.error('WiFi Scan Error:', error);
      Alert.alert(
        "Scan Failed",
        error.message.includes("No networks")
          ? "No WiFi networks found. Please ensure:\n\n1. Your device has WiFi capability\n2. There are networks in range\n3. The device firmware supports scanning"
          : error.message
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleWifiSelect = (wifi) => {
    setSelectedWifi(wifi);
    setWifiSSID(wifi.ssid);
    setShowWifiForm(true);
  };

  const saveWifiCredentials = async () => {
    try {
      setIsSaving(true);
      
      if (!(await checkDeviceConnection())) return;

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
        body: formData.toString()
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const responseData = await response.text();
      console.log('WiFi save response:', responseData);
      Alert.alert("Success", `WiFi credentials saved for ${wifiSSID}`);
      setShowWifiForm(false);
      setShowWifiModal(false);
      setShowAddDevice(true);
	  console.log('device selected..........' );
    } catch (error) {
      console.error('Error saving WiFi credentials:', error);
    } finally {
      setIsSaving(false);
	  console.log('device selected finally..........' );
	  console.log(device);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.signupButtonText}>ADD DEVICE</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* WiFi Networks Modal */}
      <Modal
        visible={showWifiModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWifiModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Available WiFi Networks</Text>
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
                    <MaterialIcons name="wifi" size={20} color={
                      wifi.rssi > -50 ? '#4CAF50' : 
                      wifi.rssi > -70 ? '#FFC107' : '#F44336'
                    } />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noNetworksText}>No networks found</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowWifiModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* WiFi Credentials Form Modal */}
      <Modal
        visible={showWifiForm}
        animationType="slide"
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
              placeholder="WiFi SSID"
              placeholderTextColor="#aaa"
              value={wifiSSID}
              onChangeText={setWifiSSID}
              editable={false}
            />
            
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="WiFi Password"
                placeholderTextColor="#aaa"
                value={wifiPassword}
                onChangeText={setWifiPassword}
                secureTextEntry={!showWifiPassword}
                autoCapitalize="none"
                color="#333"
                returnKeyType="done"
              />
              <TouchableOpacity 
                style={styles.eyeButton}
                onPress={() => setShowWifiPassword(!showWifiPassword)}
              >
                <Text style={styles.eyeButtonText}>
                  {showWifiPassword ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={[styles.signupButton, { marginTop: 20 }]} 
              onPress={saveWifiCredentials}
              activeOpacity={0.8}
              disabled={isSaving || !wifiPassword}
            >
              {isSaving ? (
                <ActivityIndicator color="white" />
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2E8B57",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  signupContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginVertical: 20,
  },
  signupText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 28,
    marginBottom: 5,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 25,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 15,
    paddingHorizontal: 15,
    borderRadius: 8,
    color: 'white',
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    marginBottom: 15,
  },
  passwordInput: {
    flex: 1,
    paddingRight: 70,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
  },
  eyeButtonText: {
    color: 'green',
    fontWeight: 'bold',
    fontSize: 12,
  },
  signupButton: {
    backgroundColor: '#1E6F9F',
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  signupButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 45, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  selectedWifiText: {
    textAlign: 'center',
    marginBottom: 15,
    color: '#555',
  },
  wifiList: {
    maxHeight: 300,
    marginBottom: 15,
  },
  wifiItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wifiText: {
    fontSize: 16,
    color: '#333',
  },
  noNetworksText: {
    textAlign: 'center',
    padding: 10,
    color: '#777',
  },
  closeButton: {
    backgroundColor: '#f44336',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default DevicePage;