import React from 'react';
import { Text, StyleSheet } from 'react-native';

const Header = () => {
  return <Text style={styles.header}>BeeGreen</Text>;
};

const styles = StyleSheet.create({
  header: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});

export default Header;
