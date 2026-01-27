import React, { useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

const AccountInfoPage = ({ navigation }) => {
  const [savedData, setSavedData] = useState(null);

  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync('config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        setSavedData(parsedConfig);
      }
    };

    fetchSavedData();
  }, []);

  const handleDelete = async () => {
    // Delete the saved data
    await SecureStore.deleteItemAsync('config');

    // Clear the savedData state
    setSavedData(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      {savedData ? (
        <View style={styles.savedDataContainer}>
          <Text style={styles.savedDataText}>MQTT User: {savedData.mqttUser}</Text>
          <Text style={styles.savedDataText}>MQTT Server: {savedData.mqttServer}</Text>
          <Text style={styles.savedDataText}>MQTT Port: {savedData.mqttPort}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <MaterialIcons name='delete' size={24} color='red' />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No account information found.</Text>
        </View>
      )}
    </SafeAreaView>
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
  placeholderContainer: {
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
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
});

export default AccountInfoPage;
