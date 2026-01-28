import React, { useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, Text, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../services/auth';

const AccountInfoPage = ({ navigation }) => {
  // Get config and logout from auth context
  const { config, logout } = useAuth();

  /**
   * Show confirmation dialog before logout
   */
  const handleLogoutPress = useCallback(() => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will remove your saved MQTT credentials.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: handleLogout,
        },
      ],
      { cancelable: true }
    );
  }, []);

  /**
   * Perform logout - clears auth state and navigates to login automatically
   */
  const handleLogout = useCallback(async () => {
    const success = await logout();
    if (!success) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
    // Navigation to login page happens automatically via AuthContext
  }, [logout]);

  return (
    <SafeAreaView style={styles.container}>
      {config ? (
        <View style={styles.contentContainer}>
          {/* Account Info Card */}
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Account Information</Text>
            
            <View style={styles.infoRow}>
              <MaterialIcons name='person' size={20} color='#2E8B57' />
              <Text style={styles.infoLabel}>MQTT User:</Text>
              <Text style={styles.infoValue}>{config.mqttUser}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <MaterialIcons name='dns' size={20} color='#2E8B57' />
              <Text style={styles.infoLabel}>Server:</Text>
              <Text style={styles.infoValue}>{config.mqttServer}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <MaterialIcons name='settings-ethernet' size={20} color='#2E8B57' />
              <Text style={styles.infoLabel}>Port:</Text>
              <Text style={styles.infoValue}>{config.mqttPort}</Text>
            </View>

            {config.wifiSSID && (
              <View style={styles.infoRow}>
                <MaterialIcons name='wifi' size={20} color='#2E8B57' />
                <Text style={styles.infoLabel}>WiFi:</Text>
                <Text style={styles.infoValue}>{config.wifiSSID}</Text>
              </View>
            )}
          </View>

          {/* Logout Button */}
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={handleLogoutPress}
            activeOpacity={0.8}
          >
            <MaterialIcons name='logout' size={22} color='#fff' />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.placeholderContainer}>
          <MaterialIcons name='account-circle' size={64} color='rgba(255,255,255,0.5)' />
          <Text style={styles.placeholderText}>No account information found.</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  cardTitle: {
    color: '#2E8B57',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#2E8B57',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  contentContainer: {
    alignItems: 'center',
    width: '100%',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 4,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  infoLabel: {
    color: '#666',
    fontSize: 14,
    marginLeft: 8,
    minWidth: 70,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  infoValue: {
    color: '#333',
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#d9534f',
    borderRadius: 8,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
    paddingHorizontal: 30,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    width: '90%',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  placeholderContainer: {
    alignItems: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
});

export default AccountInfoPage;
