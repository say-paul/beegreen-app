import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const DefaultPage = ({ navigation }) => {
  const handleAddDevice = async () => {
    const url = "http://192.168.4.1";
    try {
      // Check if the URL can be opened
      const supported = await Linking.canOpenURL(url);
      
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.log("Don't know how to open this URL: " + url);
      }
    } catch (error) {
      console.error("An error occurred:", error);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAddDevice} // Open URL instead of navigating
      >
        <MaterialIcons name="add" size={100} color="#ccc" />
        <Text style={styles.addButtonText}>Add Device</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    alignItems: "center",
  },
  addButtonText: {
    fontSize: 18,
    color: "#ccc",
    marginTop: 10,
  },
});

export default DefaultPage;