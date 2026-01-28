"""
Configuration for the notification service.

IMPORTANT: You must provide the Firebase Admin SDK credentials file.
Download it from Firebase Console > Project Settings > Service Accounts > Generate new private key
Save it as 'firebase-admin-key.json' in this directory.
"""
import os

# Path to Firebase Admin SDK credentials
# Download from: Firebase Console > Project Settings > Service Accounts
FIREBASE_CREDENTIALS_PATH = os.path.join(
    os.path.dirname(__file__),
    'firebase-admin-key.json'
)

# MQTT Broker Configuration
# Update these values to match your MQTT broker
# For HiveMQ Cloud, use port 8883 with TLS enabled
MQTT_CONFIG = {
    'broker': os.environ.get('MQTT_BROKER', 'localhost'),
    'port': int(os.environ.get('MQTT_PORT', 8883)),
    'username': os.environ.get('MQTT_USERNAME', None),
    'password': os.environ.get('MQTT_PASSWORD', None),
    'client_id': 'beegreen-notification-service',
    # Enable TLS for secure connection (required for HiveMQ Cloud)
    'use_tls': os.environ.get('MQTT_USE_TLS', 'true').lower() in ('true', '1', 'yes'),
}

# MQTT Topics to subscribe to
# '+' is a single-level wildcard for device ID
# Pattern: {deviceID}/topic_name
MQTT_TOPICS = {
    'pump_status': '+/pump_status',      # {deviceID}/pump_status
    'device_status': '+/status',          # {deviceID}/status (online/offline)
}

# FCM Topics that the app subscribes to
FCM_TOPICS = {
    'pump_events': 'pump_events',
    'device_status': 'device_status',
}

# Notification type definitions
NOTIFICATION_TYPES = {
    'pump_start': {
        'title': 'Pump Started',
        'body': 'Your irrigation pump has started',
        'fcm_topic': 'pump_events',
    },
    'pump_stop': {
        'title': 'Pump Stopped',
        'body': 'Your irrigation pump has stopped',
        'fcm_topic': 'pump_events',
    },
    'device_online': {
        'title': 'Device Online',
        'body': 'Your device is now connected',
        'fcm_topic': 'device_status',
    },
    'device_offline': {
        'title': 'Device Offline',
        'body': 'Your device has disconnected',
        'fcm_topic': 'device_status',
    },
}
