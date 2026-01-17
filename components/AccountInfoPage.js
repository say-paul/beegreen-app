import React, { useState, useEffect } from "react";
import { View, StyleSheet, SafeAreaView, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

const AccountInfoPage = ({ navigation }) => {
  const [savedData, setSavedData] = useState(null);

  useEffect(() => {
    const fetchSavedData = async () => {
      const config = await SecureStore.getItemAsync("config");
      if (config) {
        const parsedConfig = JSON.parse(config);
        setSavedData(parsedConfig);
      }
    };

    fetchSavedData();
  }, []);

  const handleDelete = async () => {
    // Delete the saved data
    await SecureStore.deleteItemAsync("config");

    // Clear the savedData state
    setSavedData(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      {savedData ? (
        <View style={styles.savedDataContainer}>
          <Text style={styles.savedDataText}>
            MQTT User: {savedData.mqttUser}
          </Text>
          <Text style={styles.savedDataText}>
            MQTT Server: {savedData.mqttServer}
          </Text>
          <Text style={styles.savedDataText}>
            MQTT Port: {savedData.mqttPort}
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
          >
            <MaterialIcons name="delete" size={24} color="red" />
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
    flex: 1,
    backgroundColor: "#228B22",
    alignItems: "center",
    justifyContent: "center",
  },
  savedDataContainer: {
    marginTop: 30,
    width: "80%",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 5,
    position: "relative", // For positioning the delete button
  },
  savedDataText: {
    fontSize: 16,
    marginBottom: 10,
    color: "#000",
  },
  deleteButton: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  placeholderContainer: {
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
  },
});

export default AccountInfoPage;