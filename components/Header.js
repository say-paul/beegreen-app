import React from "react";
import { Text, StyleSheet } from "react-native";

const Header = () => {
  return <Text style={styles.header}>BeeGreen</Text>;
};

const styles = StyleSheet.create({
  header: {
    fontSize: 40,
    color: "#fff",
    marginBottom: 20,
    fontWeight: "bold",
  },
});

export default Header;